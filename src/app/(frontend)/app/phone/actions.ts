'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ukMobile } from '@/lib/sms/ukMobile';
import { safeInternalPath } from '@/lib/auth';
import {
  findPhoneMatch,
  getVerification,
  isEmptyAccount,
  lockedMinutes,
  recordFailure,
  recordVerifiedPhone,
  resendWaitSeconds,
  setVerification,
} from '@/lib/app/phone';
import type { FormState } from '@/lib/form';

export type PhoneState = FormState & { phone?: string; sentAt?: number; lockedFor?: number };

const LOCKED = (m: number) => `Too many wrong codes. Try again in ${m} minute${m === 1 ? '' : 's'}.`;

/**
 * Step 1 (PRD task 5): send the code. Supabase's updateUser({ phone }) sends
 * it through the phone provider and parks the number as pending until the
 * code comes back. UK mobiles only, saved as +44…, which is the form every
 * text the site sends already expects (lib/sms/ukMobile).
 */
export async function sendPhoneCodeAction(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const user = await getUser();
  if (!user) redirect('/app');

  const raw = String(formData.get('phone') || '');
  const phone = ukMobile(raw.startsWith('+') || raw.startsWith('0') ? raw : `+44${raw}`);
  if (!phone) {
    return { error: 'Enter a UK mobile number — texts can only go to a mobile.' };
  }

  const v = await getVerification(user.id);
  const locked = lockedMinutes(v);
  if (locked) return { error: LOCKED(locked), lockedFor: locked };
  const wait = resendWaitSeconds(v);
  if (wait && v?.phone === phone) {
    return { ok: true, phone, sentAt: new Date(v!.last_sent_at!).getTime(), error: `Wait ${wait}s before asking for another code.` };
  }

  // Already this person's confirmed number (a reinstall, say): nothing to
  // send, just record it on the profile and move on.
  if (user.phone && user.phone_confirmed_at && `+${user.phone.replace(/^\+/, '')}` === phone) {
    await recordVerifiedPhone(user.id, phone);
    redirect(afterVerified(formData));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    console.error('[phone] send failed:', error.message);
    if (/not enabled|unsupported|provider/i.test(error.message)) {
      return { error: 'Text codes are not switched on yet. Please try again later.' };
    }
    if (/rate limit|too many|frequency/i.test(error.message)) {
      return { error: 'Too many codes requested. Wait a minute and try again.' };
    }
    if (/already|registered|exists/i.test(error.message)) {
      return { error: 'That number is already verified on another account. Sign in to that account, or use a different number.' };
    }
    return { error: 'We could not send the code just now. Please try again.' };
  }
  const sentAt = new Date().toISOString();
  await setVerification(user.id, { phone, last_sent_at: sentAt, match_user_id: null });
  return { ok: true, phone, sentAt: Date.parse(sentAt) };
}

/** Step 2: the code. Five wrong ones in a row lock the number for ten minutes. */
export async function verifyPhoneCodeAction(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const user = await getUser();
  if (!user) redirect('/app');

  const phone = String(formData.get('phone') || '');
  const token = String(formData.get('token') || '').replace(/\D/g, '');
  const v = await getVerification(user.id);
  const sentAt = v?.last_sent_at ? Date.parse(v.last_sent_at) : undefined;
  if (!phone || v?.phone !== phone) return { error: 'Start again with your number.' };

  const locked = lockedMinutes(v);
  if (locked) return { ok: true, phone, sentAt, error: LOCKED(locked), lockedFor: locked };
  if (token.length < 6) return { ok: true, phone, sentAt, error: 'Enter the 6-digit code from the text.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) {
    const message = /expired/i.test(error.message)
      ? 'That code has expired. Ask for a new one.'
      : await recordFailure(user.id, v);
    const after = await getVerification(user.id);
    return { ok: true, phone, sentAt, error: message, lockedFor: lockedMinutes(after) || undefined };
  }

  await recordVerifiedPhone(user.id, phone);

  // Hide My Email: the sign-in made a new, empty account because Apple's
  // relay address matched nothing — but the number belongs to an account we
  // know. Ask before doing anything about it.
  const match = await findPhoneMatch(user.id, phone);
  if (match && (await isEmptyAccount(user.id))) {
    await setVerification(user.id, { match_user_id: match.userId });
    redirect(`/app/phone/match${nextQuery(formData)}`);
  }

  redirect(afterVerified(formData));
}

function nextQuery(formData: FormData): string {
  const next = safeInternalPath(String(formData.get('next') || ''));
  const role = String(formData.get('role') || '');
  const q = new URLSearchParams();
  if (next) q.set('next', next);
  if (role === 'contractor' || role === 'customer') q.set('role', role);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Where a verified person goes: back to the page the gate stopped, or on. */
function afterVerified(formData: FormData): string {
  const next = safeInternalPath(String(formData.get('next') || ''));
  if (next && !next.startsWith('/app/phone')) return next;
  const role = String(formData.get('role') || '');
  return role === 'contractor' || role === 'customer' ? `/app/continue?role=${role}` : '/app/continue';
}
