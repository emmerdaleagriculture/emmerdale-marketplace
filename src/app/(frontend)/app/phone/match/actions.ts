'use server';

import { redirect } from 'next/navigation';
import { getUser, safeInternalPath } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { captchaErrorMessage } from '@/lib/captchaError';
import { getVerification, isEmptyAccount, recordVerifiedPhone, setVerification } from '@/lib/app/phone';
import type { FormState } from '@/lib/form';

export type MatchState = FormState & { step?: 'code'; email?: string };

function onward(formData: FormData): string {
  const next = safeInternalPath(String(formData.get('next') || ''));
  if (next && !next.startsWith('/app/phone')) return next;
  const role = String(formData.get('role') || '');
  return role === 'contractor' || role === 'customer' ? `/app/continue?role=${role}` : '/app/continue';
}

/** "No, keep this account": forget the match and carry on as the new account. */
export async function declineMatchAction(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const user = await getUser();
  if (!user) redirect('/app');
  await setVerification(user.id, { match_user_id: null });
  redirect(onward(formData));
}

/**
 * "Yes, that's me": prove it by a code to the existing account's email.
 * Nothing is merged on the strength of the phone alone — a number can
 * change hands.
 */
export async function sendMatchCodeAction(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const user = await getUser();
  if (!user) redirect('/app');
  const v = await getVerification(user.id);
  if (!v?.match_user_id) return { error: 'Nothing to confirm here.' };

  const admin = createServiceRoleClient();
  const { data: other } = await admin.auth.admin.getUserById(v.match_user_id);
  const email = other.user?.email;
  if (!email) return { error: 'That account has no email address to send a code to.' };

  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken } });
  if (error) {
    const captcha = captchaErrorMessage(error.message, 'login');
    if (captcha) return { error: captcha };
    console.error('[phone/match] send failed:', error.message);
    return { error: 'We could not send the code just now. Please try again.' };
  }
  return { ok: true, step: 'code', email };
}

/**
 * The code checks out: this person owns the existing account. Sign them in
 * to it (verifyOtp replaces the session), stamp the number as verified
 * there too, and remove the empty account the relay address created — only
 * if it is still empty.
 */
export async function verifyMatchCodeAction(_prev: MatchState, formData: FormData): Promise<MatchState> {
  const fresh = await getUser();
  if (!fresh) redirect('/app');
  const v = await getVerification(fresh.id);
  if (!v?.match_user_id || !v.phone) return { error: 'Nothing to confirm here.' };

  const admin = createServiceRoleClient();
  const { data: other } = await admin.auth.admin.getUserById(v.match_user_id);
  const email = other.user?.email;
  if (!email) return { error: 'That account has no email address.' };

  const token = String(formData.get('token') || '').replace(/\D/g, '');
  if (token.length < 6) return { ok: true, step: 'code', email, error: 'Enter the 6-digit code from the email.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) {
    return { ok: true, step: 'code', email, error: 'That code is not right. Check the email and try again.' };
  }

  // Now signed in as the existing account.
  await recordVerifiedPhone(data.user.id, v.phone);
  if (await isEmptyAccount(fresh.id)) {
    const { error: delErr } = await admin.auth.admin.deleteUser(fresh.id);
    if (delErr) console.error('[phone/match] could not remove the empty duplicate:', delErr.message);
  } else {
    await setVerification(fresh.id, { match_user_id: null });
  }
  redirect(onward(formData));
}
