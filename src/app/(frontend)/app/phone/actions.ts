'use server';

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ukMobile } from '@/lib/sms/ukMobile';
import {
  findPhoneMatch,
  getVerification,
  isEmptyAccount,
  lockedMinutes,
  nextSendCount,
  recordFailure,
  recordVerifiedPhone,
  resendWaitSeconds,
  setVerification,
} from '@/lib/app/phone';
import { SMS_CODE_TTL_S } from '@/lib/app/phoneRules';
import { afterPhoneStep, confirmedAuthPhone, phoneStepQuery } from '@/lib/app/phoneFlow';
import type { FormState } from '@/lib/form';

export type PhoneState = FormState & { phone?: string; sentAt?: number; lockedUntil?: string | null };

const LOCKED = (m: number) => `Too many wrong codes. Try again in ${m} minute${m === 1 ? '' : 's'}.`;

/**
 * Step 1 (PRD task 5): send the code. Supabase's updateUser({ phone }) sends
 * it through the phone provider and parks the number as pending until the
 * code comes back. UK mobiles only, saved as +44…, which is the form every
 * text the site sends already expects (lib/sms/ukMobile).
 *
 * A number already confirmed on another account is the Apple "Hide My
 * Email" case: Supabase refuses to send, so the match is offered here,
 * before any text.
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
  if (locked) return { error: LOCKED(locked), lockedUntil: v?.locked_until };
  // Thirty seconds between texts whatever the number, and a daily ceiling:
  // a signed-in account must not be a way to text arbitrary mobiles.
  const wait = resendWaitSeconds(v);
  if (wait) {
    return v?.phone === phone
      ? { ok: true, phone, sentAt: new Date(v!.last_sent_at!).getTime(), error: `Wait ${wait}s before asking for another code.` }
      : { error: `Wait ${wait}s before asking for another code.` };
  }
  const count = nextSendCount(v);
  if (count.capped) return { error: 'That’s as many codes as we can send today. Try again tomorrow, or contact us.' };

  // Already this person's confirmed number (a reinstall, say): nothing to
  // send, just record it on the profile and move on.
  if (confirmedAuthPhone(user) === phone) {
    await recordVerifiedPhone(user.id, phone);
    redirect(afterPhoneStep(formData));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      const match = await findPhoneMatch(user.id, phone);
      if (match && (await isEmptyAccount(user.id))) {
        await setVerification(user.id, { phone, match_user_id: match.userId });
        redirect(`/app/phone/match${phoneStepQuery(formData)}`);
      }
      return { error: 'That number is already verified on another account. Sign in to that account instead, or use a different number.' };
    }
    console.error('[phone] send failed:', error.message);
    if (/not enabled|unsupported|provider/i.test(error.message)) {
      return { error: 'Text codes are not switched on yet. Please try again later.' };
    }
    if (/rate limit|too many|frequency|security purposes/i.test(error.message)) {
      return { error: 'Too many codes requested. Wait a minute and try again.' };
    }
    return { error: 'We could not send the code just now. Please try again.' };
  }
  const sentAt = new Date().toISOString();
  await setVerification(user.id, {
    phone,
    last_sent_at: sentAt,
    match_user_id: null,
    sends_today: count.sends_today,
    sends_day: count.sends_day,
  });
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
  if (locked) return { ok: true, phone, sentAt, error: LOCKED(locked), lockedUntil: v?.locked_until };
  if (token.length < 6) return { ok: true, phone, sentAt, error: 'Enter the 6-digit code from the text.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) {
    // Supabase says "expired or invalid" for both. The clock tells them
    // apart: past the code's life it has expired, otherwise it was wrong,
    // and wrong ones count towards the lockout.
    const expired = sentAt != null && Date.now() - sentAt > SMS_CODE_TTL_S * 1000;
    if (expired) return { ok: true, phone, sentAt, error: 'That code has expired. Ask for a new one.' };
    const fail = await recordFailure(user.id, v);
    return { ok: true, phone, sentAt, error: fail.message, lockedUntil: fail.lockedUntil };
  }

  await recordVerifiedPhone(user.id, phone);

  // The number verified here and also verified on another account with no
  // auth phone of its own (a stamp from before the app): ask, as above.
  const match = await findPhoneMatch(user.id, phone);
  if (match && (await isEmptyAccount(user.id))) {
    await setVerification(user.id, { match_user_id: match.userId });
    redirect(`/app/phone/match${phoneStepQuery(formData)}`);
  }

  redirect(afterPhoneStep(formData));
}
