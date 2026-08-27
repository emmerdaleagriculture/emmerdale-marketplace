import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { parseReplyEmail, stripReply } from '@/lib/quoteParse/replyLlm';
import { notifyAdmins } from '@/lib/adminNotify';

/**
 * POST /api/inbound-email — Resend inbound webhook for contractor replies to
 * invitation emails (spec §17). The invitation's reply_to is
 * quotes+{invitationToken}@{SQ_INBOUND_REPLY_DOMAIN}; the plus-address token
 * routes the reply to its invitation. A parsed figure NEVER goes live — it
 * becomes an unconfirmed quote plus a one-click confirm email.
 *
 * Verified with Resend's Svix-style signature (RESEND_INBOUND_WEBHOOK_SECRET,
 * whsec_…): HMAC-SHA256 over "{id}.{timestamp}.{body}", constant-time compare.
 */

const CONFIDENCE_THRESHOLD = 0.7;
const MAX_LLM_CALLS_PER_INVITATION = 3;

function verifySvix(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !timestamp || !sigHeader) return false;
  // Reject stale timestamps (5 min tolerance) to blunt replays.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of sigHeader.split(' ')) {
    const [, sig] = part.split(',');
    if (!sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

function extractToken(addresses: string[]): string | null {
  for (const addr of addresses) {
    const m = /quotes\+([0-9a-f]{48})@/i.exec(addr);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'RESEND_INBOUND_WEBHOOK_SECRET not set' }, { status: 500 });
  }

  const body = await request.text();
  if (!verifySvix(body, request.headers, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!event.type?.includes('email.received')) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const data = event.data ?? {};
  const from = String(data.from ?? '');
  const toList = Array.isArray(data.to) ? data.to.map(String) : [String(data.to ?? '')];
  const rawText =
    typeof data.text === 'string' && data.text.trim()
      ? data.text
      : String(data.html ?? '').replace(/<[^>]+>/g, ' ');
  const excerpt = stripReply(rawText);

  const admin = createServiceRoleClient();
  const log = async (
    invitationId: string | null,
    outcome: string,
    parsed?: unknown,
  ) => {
    await admin.from('inbound_email_events').insert({
      invitation_id: invitationId,
      from_email: from.slice(0, 300),
      to_email: toList.join(', ').slice(0, 300),
      raw_excerpt: excerpt,
      parsed: (parsed ?? null) as never,
      outcome,
    });
  };

  const token = extractToken(toList);
  if (!token || !isTokenFormat(token)) {
    await log(null, 'no_token');
    await notifyAdmins(
      'Inbound email with no invitation token',
      `From: ${from}\nTo: ${toList.join(', ')}\n\n${excerpt.slice(0, 800)}`,
    );
    return NextResponse.json({ received: true, outcome: 'no_token' });
  }

  const { data: invitation } = await admin
    .from('job_invitations')
    .select('id, token, contractor:contractors(email, business_name)')
    .eq('token', token)
    .maybeSingle();
  if (!invitation) {
    await log(null, 'no_token');
    return NextResponse.json({ received: true, outcome: 'unknown_token' });
  }

  // Only the invited contractor's address may act on this token by email.
  const contractorEmail = (invitation.contractor as { email: string } | null)?.email ?? '';
  if (!from.toLowerCase().includes(contractorEmail.toLowerCase()) || !contractorEmail) {
    await log(invitation.id, 'unknown_sender');
    await notifyAdmins(
      'Inbound reply from an unexpected sender',
      `Invitation ${invitation.id}\nExpected: ${contractorEmail}\nGot: ${from}\n\n${excerpt.slice(0, 800)}`,
    );
    return NextResponse.json({ received: true, outcome: 'unknown_sender' });
  }

  // Cost cap per invitation.
  const { count } = await admin
    .from('inbound_email_events')
    .select('id', { count: 'exact', head: true })
    .eq('invitation_id', invitation.id);
  if ((count ?? 0) >= MAX_LLM_CALLS_PER_INVITATION) {
    await log(invitation.id, 'error', { reason: 'llm_cap' });
    await notifyAdmins(
      'Inbound reply cap reached',
      `Invitation ${invitation.id} has had ${count} email replies — handling manually.\n\n${excerpt.slice(0, 800)}`,
    );
    return NextResponse.json({ received: true, outcome: 'cap' });
  }

  const result = await parseReplyEmail(excerpt);
  if (!result.ok) {
    await log(invitation.id, 'error', { error: result.error });
    await notifyAdmins(
      'Inbound reply could not be parsed',
      `Invitation ${invitation.id} (${contractorEmail})\n\n${excerpt.slice(0, 800)}`,
    );
    return NextResponse.json({ received: true, outcome: 'error' });
  }
  const parse = result.parse;

  if (parse.intent === 'decline') {
    const { data: declined } = await admin.rpc('decline_invitation', {
      p_token: token,
      p_reason: 'not_interested',
    });
    await log(invitation.id, 'declined', parse);
    return NextResponse.json({ received: true, outcome: 'declined', result: declined });
  }

  const firmFigure =
    parse.intent === 'quote' &&
    parse.amount_pence !== null &&
    !parse.is_range &&
    parse.confidence >= CONFIDENCE_THRESHOLD;

  if (!firmFigure) {
    await log(invitation.id, 'no_figure', parse);
    await notifyAdmins(
      'Inbound reply needs a human',
      `Invitation ${invitation.id} (${contractorEmail}) — ` +
        `${parse.is_range ? 'a range' : parse.mentions_vat ? 'VAT-qualified' : 'no firm figure'}.\n\n` +
        `Read as: ${JSON.stringify(parse)}\n\n${excerpt.slice(0, 800)}`,
    );
    return NextResponse.json({ received: true, outcome: 'no_figure' });
  }

  // Firm single figure → unconfirmed quote; the RPC emails the one-click
  // confirm. mentions_vat still goes through — the confirm email restates the
  // figure and the contractor corrects it via the form if it's ex-VAT.
  const { data: submitted, error } = await admin.rpc('submit_contractor_quote', {
    p_token: token,
    p_quote_type: 'total',
    p_price_pence: parse.amount_pence as number,
    p_rate_value_pence: null as unknown as number,
    p_rate_minimum_pence: null as unknown as number,
    p_site_visit: parse.needs_site_visit,
    p_notes: 'From email reply' as string,
    p_valid_until: null as unknown as string,
    p_source: 'email_parsed',
    p_confirmed: false,
  });
  if (error) {
    console.error('[inbound] submit failed:', error);
    await log(invitation.id, 'error', { error: error.message, parse });
    return NextResponse.json({ received: true, outcome: 'error' });
  }
  await log(invitation.id, 'quote_pending_confirm', parse);
  return NextResponse.json({ received: true, outcome: 'quote_pending_confirm', result: submitted });
}
