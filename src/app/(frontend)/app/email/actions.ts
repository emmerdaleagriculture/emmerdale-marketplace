'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  if (token.length < 6) return { ok: true, email, error: 'Enter the 6-digit code from the email.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.session) {
    return {
      ok: true,
      email,
      error: /expired/i.test(error?.message ?? '')
        ? 'That code has expired. Ask for a new one.'
        : 'That code is not right. Check the email and try again.',
    };
  }
  const role = roleIntent(String(formData.get('role') || ''));
  redirect(role ? `/app/continue?role=${role}` : '/app/continue');
}
