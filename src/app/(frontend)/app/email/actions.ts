'use server';

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { demoEmailCode } from '@/lib/app/demoAccounts';
import { tokensEqual } from '@/lib/sealedQuotes/tokens';
import { getVerification, lockedMinutes, recordFailure, setVerification } from '@/lib/app/phone';
import { captchaErrorMessage } from '@/lib/captchaError';
import { emailDeliveryError } from '@/lib/email/deliverable';
import { roleIntent } from '@/lib/app/landing';
import type { FormState } from '@/lib/form';

export type EmailCodeState = FormState & { email?: string; sentAt?: number };

/**
 * Step 1 of "Continue with email" (PRD task 4): send a six-digit code. The
 * same Supabase call creates the account when there isn't one, so there is
 * no separate sign-up in the app. Captcha is enforced on this endpoint
 * (Supabase attack protection), so the Turnstile token is forwarded.
 */
export async function sendEmailCodeAction(_prev: EmailCodeState, formData: FormData): Promise<EmailCodeState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { error: 'Enter your email address.' };

  // The store reviewers' demo logins: a fixed code, no email (lib/app/demoAccounts).
  if (demoEmailCode(email)) return { ok: true, email, sentAt: Date.now() };

  const deliveryError = await emailDeliveryError(email, 'Your sign-in code goes to this address');
  if (deliveryError) return { error: deliveryError };

  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, captchaToken },
  });
  if (error) {
    const captcha = captchaErrorMessage(error.message, 'login');
    if (captcha) return { error: captcha };
    if (/security purposes|after \d+ seconds/i.test(error.message)) {
      const secs = error.message.match(/(\d+) seconds/)?.[1];
      return { error: `A code was sent a moment ago. Wait ${secs ? `${secs} seconds` : 'a minute'} and try again, or check your inbox.` };
    }
    if (/rate limit|too many/i.test(error.message)) {
      return { error: 'Too many codes requested. Wait a minute and try again.' };
    }
    console.error('[app/email] send failed:', error.message);
    return { error: 'We could not send the code just now. Please try again.' };
  }
  return { ok: true, email, sentAt: Date.now() };
}

/** Step 2: the code. A session is set in the cookies on success. */
export async function verifyEmailCodeAction(_prev: EmailCodeState, formData: FormData): Promise<EmailCodeState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const token = String(formData.get('token') || '').replace(/\D/g, '');
  if (!email) return { error: 'Start again with your email address.' };
  if (token.length < 6) return { error: 'Enter the 6-digit code from the email.' };

  const demo = demoEmailCode(email);
  if (demo) {
    // A fixed code never expires, so the attempts are what bounds guessing:
    // the phone step's counter (five wrong, ten minutes out), on the demo
    // account itself. Supabase's own OTP limits never see this path.
    const userId = await demoUserId(email);
    if (!userId) return { error: 'That code is not right. Check the email and try again.' };
    const v = await getVerification(userId);
    const locked = lockedMinutes(v);
    if (locked) return { error: `Too many wrong codes. Try again in ${locked} minute${locked === 1 ? '' : 's'}.` };
    if (!tokensEqual(token, demo)) return { error: (await recordFailure(userId, v)).message };
    if (!(await signInDemoAccount(email))) return { error: 'We could not sign you in just now. Please try again.' };
    await setVerification(userId, { failures: 0, locked_until: null });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) {
      return {
        error: /expired/i.test(error?.message ?? '')
          ? 'That code has expired. Ask for a new one.'
          : 'That code is not right. Check the email and try again.',
      };
    }
  }
  const role = roleIntent(String(formData.get('role') || ''));
  redirect(role ? `/app/continue?role=${role}` : '/app/continue');
}

/** The demo account behind the address: its profile row, customer or contractor. */
async function demoUserId(email: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const [c, k] = await Promise.all([
    admin.from('customers').select('id').eq('email', email).maybeSingle(),
    admin.from('contractors').select('id').eq('email', email).maybeSingle(),
  ]);
  return c.data?.id ?? k.data?.id ?? null;
}

/**
 * A session for a demo login without any email: a magic link is minted
 * with the service role and its token hash verified straight away on the
 * cookie client, which sets the auth cookies as a real code would.
 */
async function signInDemoAccount(email: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token) {
    console.error('[app/email] demo link failed:', error?.message ?? 'no token');
    return false;
  }
  const supabase = await createClient();
  const res = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (res.error || !res.data.session) {
    console.error('[app/email] demo sign-in failed:', res.error?.message ?? 'no session');
    return false;
  }
  return true;
}
