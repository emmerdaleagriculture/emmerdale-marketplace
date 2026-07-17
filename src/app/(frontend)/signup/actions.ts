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
    const msg = signUpErr.message;
    // GoTrue wraps the Cloudflare siteverify reason in the message. The reason
    // tells us which layer failed, so map each to distinct, accurate guidance
    // (and log the raw reason for diagnosis).
    if (/captcha/i.test(msg)) {
      console.error('[signup] captcha rejected by Supabase:', msg);
      if (/no captcha_token found/i.test(msg)) {
        // The browser submitted without a token — the widget hadn't finished.
        return { error: 'The security check didn’t finish. Wait for it to complete, then submit again.' };
      }
      if (/timeout-or-duplicate/i.test(msg)) {
        // Token expired (>5 min) or was already used — a fresh one is minted now.
        return { error: 'The security check timed out. It has refreshed — please submit again.' };
      }
      if (/invalid-input-response/i.test(msg)) {
        // Token was well-formed but Cloudflare rejected it. Almost always a
        // config mismatch (the Supabase secret and the site key belong to
        // different Turnstile widgets), which the user can't fix — so don't
        // tell them to just retry.
        return {
          error:
            'The security check could not be verified. This is a configuration issue on our end — please contact us so we can fix it.',
        };
      }
      return { error: 'The security check failed. Please try again.' };
    }
    return { error: msg };
  }
  // Supabase obfuscates re-signups (returns a user with no identities). Treat as
  // "email already in use" rather than leaking which addresses are registered.
  if (!signUp.user?.id || (signUp.user && signUp.user.identities?.length === 0)) {
    return { error: 'That email is already registered. Try logging in instead.' };
  }

  return { ok: true, message: SUCCESS_MESSAGE };
}
