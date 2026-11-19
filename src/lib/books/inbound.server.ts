/**
 * Receipts by email: fetch an inbound email from Resend and turn it into
 * receipts. Each PDF or image attachment becomes one receipt (small images
 * are skipped); an email with none becomes one receipt from its body, which
 * is how most online order confirmations arrive. The same Message-ID twice
 * is ignored. Mail from a sender not on the books' list is stored but not
 * read by AI until the contractor asks.
 */

import { Resend } from 'resend';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { storeReceipt } from './receipts.server';
import { MAX_ATTACHMENTS, MIN_IMAGE_BYTES, attachmentType, bareAddress, findInboundCode } from './inbound';
import { MAX_RECEIPT_BYTES } from './receipts.server';
import { booksAllowed } from './access';

export type InboundOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'stored'; ledgerId: string; toRead: number[]; held: number };

type EventData = {
  email_id?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  received_for?: string[];
  message_id?: string;
  subject?: string;
};

/**
 * Reading inbound mail needs a Resend key that can do more than send (a
 * "sending access" key is refused with restricted_api_key). Use a separate
 * full-access key for this if the main one is send-only.
 */
function resend() {
  const key = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_INBOUND_API_KEY / RESEND_API_KEY is not set');
  return new Resend(key);
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_RECEIPT_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_RECEIPT_BYTES ? null : buf;
  } catch {
    return null;
  }
}

export async function handleInboundEmail(data: EventData): Promise<InboundOutcome> {
  const admin = createServiceRoleClient();
  const headerCode = findInboundCode([...(data.to ?? []), ...(data.cc ?? []), ...(data.received_for ?? [])]);
  if (!data.email_id) return { kind: 'ignored', reason: 'no email id' };

  // The full email: body, headers (a forward may only keep the code in a delivery header).
  const { data: email, error } = await resend().emails.receiving.get(data.email_id);
  if (error || !email) {
    console.error('[books] inbound fetch failed', { id: data.email_id, error: error?.message });
    throw new Error('inbound fetch failed');
  }
  const headers = email.headers ?? {};
  const code =
    headerCode ??
    findInboundCode([
      ...email.to,
      ...(email.cc ?? []),
      ...(email.received_for ?? []),
      headers['delivered-to'],
      headers['Delivered-To'],
      headers['x-original-to'],
      headers['X-Original-To'],
      headers['x-forwarded-to'],
      headers['X-Forwarded-To'],
      headers['to'],
      headers['To'],
    ]);
  if (!code) return { kind: 'ignored', reason: 'not a books address' };

  const { data: ledger } = await admin
    .from('books_ledgers')
    .select('id, contractor_id, inbound_senders')
    .eq('inbound_code', code)
    .maybeSingle();
  if (!ledger) return { kind: 'ignored', reason: 'unknown code' };

  const messageId = (email.message_id || data.message_id || data.email_id).slice(0, 500);
  const { data: seen } = await admin
    .from('books_receipts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('message_id', messageId)
    .limit(1);
  if (seen?.length) return { kind: 'ignored', reason: 'already received' };

  // Allowed senders: the contractor's own account email and their list.
  const sender = bareAddress(email.from || data.from || '');
  const { data: owner } = await admin.auth.admin.getUserById(ledger.contractor_id);
  if (!(await booksAllowed(owner.user?.email))) return { kind: 'ignored', reason: 'books not released to this account' };
  const allowed = new Set([...(ledger.inbound_senders ?? []), owner.user?.email?.toLowerCase()].filter(Boolean) as string[]);
  const trusted = allowed.has(sender);

  const extra = {
    source: 'email',
    email_from: (email.from || data.from || '').slice(0, 300),
    email_to: receiptsTo(email.to),
    email_subject: (email.subject || data.subject || '').slice(0, 300) || null,
    message_id: messageId,
    received_at: email.created_at || new Date().toISOString(),
    ...(trusted
      ? {}
      : {
          status: 'needs_review',
          processing_started_at: null,
          review_reasons: `From ${sender || 'an unknown sender'}, who isn’t on your list of senders, so it hasn’t been read. Read it with AI if it’s yours, or add the address in Settings.`,
        }),
  } as const;

  const toRead: number[] = [];
  let held = 0;
  const keep = (r: { id: number; read: boolean } | { error: string }) => {
    if ('error' in r) return;
    if (r.read && trusted) toRead.push(r.id);
    else if (!trusted) held += 1;
  };

  // Attachments first.
  let stored = 0;
  if (email.attachments.length) {
    const { data: list } = await resend().emails.receiving.attachments.list({ emailId: data.email_id });
    for (const a of (list?.data ?? []).slice(0, MAX_ATTACHMENTS * 2)) {
      if (stored >= MAX_ATTACHMENTS) break;
      const mime = attachmentType(a.content_type, a.filename);
      if (!mime || a.size > MAX_RECEIPT_BYTES) continue;
      if (mime.startsWith('image/') && a.size < MIN_IMAGE_BYTES) continue;
      if (a.content_disposition === 'inline' && mime.startsWith('image/') && a.size < 50_000) continue;
      const buf = await download(a.download_url);
      if (!buf) continue;
      keep(await storeReceipt(ledger.id, { buf, mime, name: a.filename ?? null }, extra));
      stored += 1;
    }
  }

  // No usable attachment: the email itself is the receipt.
  if (stored === 0) {
    const body = email.html?.trim() ? { text: email.html, mime: 'text/html' } : email.text?.trim() ? { text: email.text, mime: 'text/plain' } : null;
    if (!body) return { kind: 'ignored', reason: 'empty email' };
    // Inline images arrive as data: URIs in the HTML; drop them, they are kept nowhere and only add size.
    const cleaned = body.text.replace(/src="data:[^"]{200,}"/g, 'src=""').slice(0, 2_000_000);
    keep(
      await storeReceipt(
        ledger.id,
        { buf: Buffer.from(cleaned, 'utf8'), mime: body.mime, name: (email.subject || 'Email').slice(0, 120) },
        extra,
      ),
    );
  }

  return { kind: 'stored', ledgerId: ledger.id, toRead, held };
}

function receiptsTo(to: string[]): string | null {
  const ours = to.find((t) => /receipts\+/i.test(t)) ?? to[0];
  return ours ? ours.slice(0, 300) : null;
}
