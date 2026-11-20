/**
 * People a contractor lets see their books: an accountant, a bookkeeper, a
 * partner. Always read only. The owner invites by email (Books › Settings);
 * the link is accepted by signing in, or creating an account, with that same
 * address. See supabase/migrations/20261120170000_books_viewers.sql.
 */

import { Resend } from 'resend';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import type { Database } from '@/lib/database.types';
import type { Ledger } from './server';

export type BooksViewer = Database['public']['Tables']['books_viewers']['Row'];

export const MAX_VIEWERS = 10;

export function inviteLink(token: string): string {
  return `${siteUrl()}/account/books/join/${token}`;
}

export function cleanEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/** Live (not removed) viewers of one ledger, newest first. */
export async function listViewers(ledgerId: string): Promise<BooksViewer[]> {
  const { data, error } = await createServiceRoleClient()
    .from('books_viewers')
    .select('*')
    .eq('ledger_id', ledgerId)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Ledgers this signed-in person has accepted an invitation to, with the owner's name. */
export async function sharedLedgers(userId: string): Promise<{ ledger: Ledger; ownerName: string }[]> {
  const admin = createServiceRoleClient();
  const { data: rows } = await admin.from('books_viewers').select('ledger_id').eq('user_id', userId).is('revoked_at', null);
  const ids = [...new Set((rows ?? []).map((r) => r.ledger_id))];
  if (!ids.length) return [];
  const { data: ledgers } = await admin.from('books_ledgers').select('*').in('id', ids);
  const ownerIds = (ledgers ?? []).map((l) => l.contractor_id);
  const { data: owners } = ownerIds.length
    ? await admin.from('contractors').select('id, business_name').in('id', ownerIds)
    : { data: [] as { id: string; business_name: string }[] };
  const names = new Map((owners ?? []).map((o) => [o.id, o.business_name]));
  return (ledgers ?? [])
    .map((l) => ({ ledger: l, ownerName: l.trading_name || l.legal_name || names.get(l.contractor_id) || 'Books' }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

export async function inviteViewer(
  ledger: Ledger,
  ownerEmail: string | null,
  emailRaw: unknown,
  nameRaw: unknown,
): Promise<{ ok: true; email: string; sent: boolean } | { ok: false; error: string }> {
  const email = cleanEmail(emailRaw);
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  if (ownerEmail && email === ownerEmail.trim().toLowerCase()) return { ok: false, error: 'That’s your own address. You already have your books.' };
  const name = String(nameRaw ?? '').trim().slice(0, 120) || null;
  const existing = await listViewers(ledger.id);
  if (existing.some((v) => v.email === email)) return { ok: false, error: `${email} already has access. Remove them first to send a fresh invitation.` };
  if (existing.length >= MAX_VIEWERS) return { ok: false, error: `You can share your books with up to ${MAX_VIEWERS} people.` };
  const { data, error } = await createServiceRoleClient()
    .from('books_viewers')
    .insert({ ledger_id: ledger.id, email, name })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[books] viewer invite failed', { ledger: ledger.id, error: error?.message });
    return { ok: false, error: 'That didn’t save. Please try again.' };
  }
  const sent = await sendInviteEmail(data, ledger, ownerEmail);
  return { ok: true, email, sent };
}

export async function resendInvite(ledger: Ledger, ownerEmail: string | null, id: number): Promise<boolean> {
  const { data } = await createServiceRoleClient()
    .from('books_viewers')
    .select('*')
    .eq('id', id)
    .eq('ledger_id', ledger.id)
    .is('revoked_at', null)
    .maybeSingle();
  return data ? sendInviteEmail(data, ledger, ownerEmail) : false;
}

export async function revokeViewer(ledgerId: string, id: number): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .from('books_viewers')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('ledger_id', ledgerId)
    .is('revoked_at', null)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/** The invitation behind a link, if it is still live. */
export async function inviteByToken(token: string): Promise<(BooksViewer & { ownerName: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const admin = createServiceRoleClient();
  const { data: v } = await admin.from('books_viewers').select('*').eq('token', token).is('revoked_at', null).maybeSingle();
  if (!v) return null;
  const { data: l } = await admin.from('books_ledgers').select('trading_name, legal_name, contractor_id').eq('id', v.ledger_id).maybeSingle();
  if (!l) return null;
  const { data: c } = await admin.from('contractors').select('business_name').eq('id', l.contractor_id).maybeSingle();
  return { ...v, ownerName: l.trading_name || l.legal_name || c?.business_name || 'a contractor' };
}

/**
 * Accept: the signed-in address must be the invited one, so a forwarded
 * email can't hand the books to someone else.
 */
export async function acceptInvite(
  token: string,
  user: { id: string; email: string | null | undefined },
): Promise<{ ok: true; ledgerId: string } | { ok: false; reason: 'gone' | 'wrong-email'; invitedEmail?: string }> {
  const v = await inviteByToken(token);
  if (!v) return { ok: false, reason: 'gone' };
  if ((user.email ?? '').trim().toLowerCase() !== v.email) return { ok: false, reason: 'wrong-email', invitedEmail: v.email };
  if (v.user_id !== user.id) {
    await createServiceRoleClient()
      .from('books_viewers')
      .update({ user_id: user.id, accepted_at: v.accepted_at ?? new Date().toISOString() })
      .eq('id', v.id);
  }
  return { ok: true, ledgerId: v.ledger_id };
}

export async function touchViewer(userId: string, ledgerId: string): Promise<void> {
  await createServiceRoleClient()
    .from('books_viewers')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('ledger_id', ledgerId)
    .is('revoked_at', null);
}

const FROM_ADDRESS = () => process.env.BOOKS_INVOICE_FROM || 'invoices@emmerdaleagriculture.com';

function displayName(s: string): string {
  return s.replace(/["<>\r\n,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

async function sendInviteEmail(v: BooksViewer, ledger: Ledger, ownerEmail: string | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const business = ledger.trading_name || ledger.legal_name || 'A contractor';
  const link = inviteLink(v.token);
  const greeting = v.name?.split(/\s+/)[0] || 'there';
  const text = [
    `Hello ${greeting},`,
    '',
    `${business} has given you read-only access to their books on Emmerdale Agriculture: the ledger, trial balance, profit and loss, VAT, receipts, invoices and bank.`,
    '',
    `Open them here: ${link}`,
    '',
    `Sign in, or create a free account, with this email address (${v.email}). You can look at and download everything, but you can’t change anything.`,
    '',
    ownerEmail ? `Questions about the books? Reply to this email to reach ${business}.` : '',
    '',
    'Emmerdale Agriculture',
  ].join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1b;max-width:560px">
<p>Hello ${esc(greeting)},</p>
<p><b>${esc(business)}</b> has given you read-only access to their books on Emmerdale Agriculture: the ledger, trial balance, profit and loss, VAT, receipts, invoices and bank.</p>
<p><a href="${link}" style="display:inline-block;background:#1f4d2b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open the books</a></p>
<p>Sign in, or create a free account, with this email address (<b>${esc(v.email)}</b>). You can look at and download everything, but you can’t change anything.</p>
${ownerEmail ? `<p>Questions about the books? Reply to this email to reach ${esc(business)}.</p>` : ''}
<p style="font-size:12px;color:#6b6b66">Sent for ${esc(business)} by Emmerdale Agriculture.</p></div>`;
  const { error } = await new Resend(key).emails.send({
    from: `${displayName(business)} via Emmerdale <${FROM_ADDRESS()}>`,
    to: [v.email],
    ...(ownerEmail ? { replyTo: ownerEmail } : {}),
    subject: `${business} has shared their books with you`,
    text,
    html,
    tags: [{ name: 'kind', value: 'books_viewer_invite' }],
  });
  if (error) {
    console.error('[books] viewer invite email failed', { viewer: v.id, error: error.message });
    return false;
  }
  return true;
}
