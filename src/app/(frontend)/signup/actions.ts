'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  accept: z.literal('on', { message: 'You must accept the terms and privacy policy.' }),
});

const SUCCESS_MESSAGE =
  'Account created. Check your email to confirm your address — then sign in and tell us about your business.';

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Bot traps: a hidden field real users never see, and a minimum time-to-fill.
  // Pretend success so bots can't tell they were caught.
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (honeypot || (renderedAt > 0 && Date.now() - renderedAt < 3000)) {
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  const parsed = SignupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    accept: formData.get('accept'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  // Supabase verifies the Turnstile token when captcha protection is enabled
  // for the project; without a valid token it rejects the signup.
  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;

  // Create the auth user only. The contractor profile is collected afterwards
  // in onboarding (the contractors row has NOT NULL business columns, so it
  // can't exist until those details are supplied).
  const supabase = await createClient();
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/onboarding`,
      captchaToken,
    },
  });

  if (signUpErr) {
    // Raw GoTrue captcha errors ("captcha protection: request disallowed…")
    // mean the token was missing or stale — tell the user what to actually do.
    if (/captcha/i.test(signUpErr.message)) {
      return { error: 'The security check expired. Please wait for it to refresh, then submit again.' };
    }
    return { error: signUpErr.message };
  }
  // Supabase obfuscates re-signups (returns a user with no identities). Treat as
  // "email already in use" rather than leaking which addresses are registered.
  if (!signUp.user?.id || (signUp.user && signUp.user.identities?.length === 0)) {
    return { error: 'That email is already registered. Try logging in instead.' };
  }

  return { ok: true, message: SUCCESS_MESSAGE };
}
