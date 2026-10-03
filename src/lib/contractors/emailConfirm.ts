import { randomBytes } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * A contractor whose email bounces gets no email and no job invitations
 * (sq_invite_contractor refuses an address on undeliverable_emails). This is
 * how they get back: ask for a link at an address, open it, press Confirm.
 *
 * Delivering the link is the proof, so the same flow serves a new address
 * and the old one once its mailbox is fixed. Supabase's own email change
 * cannot do this, because with secure email change it also wants the OLD
 * address to confirm — the one that bounces.
 *
 * Everything here runs as the service role: undeliverable_emails and the
 * verification table are deliberately unreadable from the client.
 */

const LINKS_PER_HOUR = 3;

export type EmailHealth = {
  /** The address invitations go to (contractors.email). */
  email: string;
  undeliverable: boolean;
  /** Why we stopped, in the provider's words, for the banner. */
  detail: string | null;
  since: string | null;
  /** The most recent unused, unexpired link, if one is waiting. */
  pending: { email: string; sentAt: string } | null;
};

export async function contractorEmailHealth(contractorId: string, email: string): Promise<EmailHealth> {
  const admin = createServiceRoleClient();
  const [deadQ, pendingQ] = await Promise.all([
    admin
      .from('undeliverable_emails')
      .select('first_seen_at, last_detail')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle(),
    admin
      .from('contractor_email_verifications')
      .select('email, created_at')
      .eq('contractor_id', contractorId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    email,
    undeliverable: !!deadQ.data,
    detail: deadQ.data?.last_detail ?? null,
    since: deadQ.data?.first_seen_at ?? null,
    pending: pendingQ.data ? { email: pendingQ.data.email, sentAt: pendingQ.data.created_at } : null,
  };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmailConfirmation(contractorId: string, rawEmail: string): Promise<SendResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: 'That doesn’t look like an email address.' };
  }

  const admin = createServiceRoleClient();
  const { data: ct } = await admin
    .from('contractors')
    .select('business_name, contact_name')
    .eq('id', contractorId)
    .maybeSingle();
  if (!ct) return { ok: false, error: 'We couldn’t find your contractor profile.' };

  // A link is an email we send on request, so it is rate-limited like one.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('contractor_email_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('contractor_id', contractorId)
    .gt('created_at', hourAgo);
  if ((count ?? 0) >= LINKS_PER_HOUR) {
    return { ok: false, error: 'We’ve sent a few links already. Please try again in an hour.' };
  }

  const token = randomBytes(24).toString('base64url');
  const { error: insErr } = await admin
    .from('contractor_email_verifications')
    .insert({ contractor_id: contractorId, email, token });
  if (insErr) return { ok: false, error: 'Could not create the link. Please try again.' };

  const { error: qErr } = await admin.from('pending_emails').insert({
    kind: 'contractor_email_verify',
    to_email: email,
    payload: { token, business_name: ct.business_name, contact_name: ct.contact_name },
  });
  if (qErr) return { ok: false, error: 'Could not send the link. Please try again.' };

  return { ok: true };
}

export type PendingConfirmation =
  | { state: 'ok'; email: string; businessName: string }
  | { state: 'used' | 'expired' | 'missing' };

export async function lookupConfirmation(token: string): Promise<PendingConfirmation> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('contractor_email_verifications')
    .select('email, used_at, expires_at, contractors(business_name)')
    .eq('token', token)
    .maybeSingle();
  if (!data) return { state: 'missing' };
  if (data.used_at) return { state: 'used' };
  if (new Date(data.expires_at).getTime() < Date.now()) return { state: 'expired' };
  const ct = data.contractors as { business_name: string } | null;
  return { state: 'ok', email: data.email, businessName: ct?.business_name ?? 'your business' };
}

export type ConfirmResult =
  | { ok: true; email: string; invited: number }
  | { ok: false; error: string };

export async function confirmEmail(token: string): Promise<ConfirmResult> {
  const admin = createServiceRoleClient();

  // Claimed first, atomically, so a double click or a link scanner racing the
  // contractor cannot apply it twice.
  const { data: v } = await admin
    .from('contractor_email_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, contractor_id, email')
    .maybeSingle();
  if (!v) return { ok: false, error: 'This link has expired or has already been used.' };

  const unclaim = () => admin.from('contractor_email_verifications').update({ used_at: null }).eq('id', v.id);

  const { data: ct } = await admin
    .from('contractors')
    .select('email')
    .eq('id', v.contractor_id)
    .maybeSingle();
  if (!ct) return { ok: false, error: 'We couldn’t find your contractor profile.' };

  // The login moves with the address: it is the one that works now, and a
  // contractor who signs in with the old one later would be confused to find
  // invitations going somewhere else. The address is proven, so it is marked
  // confirmed rather than sent a second Supabase confirmation.
  const { data: authUser } = await admin.auth.admin.getUserById(v.contractor_id);
  if (authUser.user && authUser.user.email?.toLowerCase() !== v.email) {
    const { error } = await admin.auth.admin.updateUserById(v.contractor_id, {
      email: v.email,
      email_confirm: true,
    });
    if (error) {
      await unclaim();
      return {
        ok: false,
        error: /already|registered|exists/i.test(error.message)
          ? 'That address already belongs to another account on Emmerdale Agriculture. Use a different one, or contact us.'
          : 'We couldn’t update your sign-in email. Please try again or contact us.',
      };
    }
  }

  // Cleared before the catch-up below, which sq_invite_contractor would
  // otherwise refuse for this address.
  await admin.from('undeliverable_emails').delete().eq('email', v.email);

  if (ct.email.trim().toLowerCase() !== v.email) {
    const { error } = await admin.from('contractors').update({ email: v.email }).eq('id', v.contractor_id);
    if (error) return { ok: false, error: 'We couldn’t save your new address. Please contact us.' };
  }

  // Any other links still out for this contractor are now moot.
  await admin
    .from('contractor_email_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('contractor_id', v.contractor_id)
    .is('used_at', null);

  // Catch them up on the jobs they missed while blocked. The late-invite
  // trigger only fires on approval, not on an email change, so this is the
  // call that does it. Returns 0 for a contractor not yet approved.
  const { data: invited } = await admin.rpc('invite_contractor_to_open_jobs', {
    p_contractor_id: v.contractor_id,
  });

  return { ok: true, email: v.email, invited: typeof invited === 'number' ? invited : 0 };
}
