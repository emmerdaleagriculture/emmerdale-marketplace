'use server';

import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { emailDeliveryError } from '@/lib/email/deliverable';
import { redirect } from 'next/navigation';
import { safeInternalPath } from '@/lib/auth';
import { forgetJustSentJob, justSentJob } from '@/lib/jobCookie';
import { claimJobForUser } from '@/lib/customers/claim';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';
import { cleanSignupSource, SIGNUP_SOURCE_KEYS } from '@/lib/signupSource';
import { captchaErrorMessage } from '@/lib/captchaError';

const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  accept: z.literal('on', { message: 'You must accept the terms and privacy policy.' }),
});

const SUCCESS_MESSAGE =
  'Account created. Check your email to confirm your address — then sign in and tell us about your business.';

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Bot traps: a hidden field real users never see, and a minimum time-to-fill.
  // Until 2026-10-15 a trapped submission was faked away with the "check your
  // email" message. Email confirmation is off, so that mail never comes, and a
  // real contractor caught by the trap (browser autofill can write a business's
  // URL into a hidden "website" field) waited for it, then was told at log in
  // that the address wasn't confirmed. Supabase already rejects any signup
  // without a solved Turnstile, so the trap is a signal, not the gate: record
  // it and let the signup go through, as /start does.
  const honeypot = String(formData.get('website') || '');
  const renderedAt = Number(formData.get('form_ts') || 0);
  const tooFast = renderedAt > 0 && Date.now() - renderedAt < 3000;
  if (honeypot || tooFast) {
    const why = honeypot ? 'honeypot' : 'too_fast';
    console.warn('[signup] bot trap fired, continuing:', why);
    Sentry.captureMessage('signup bot trap fired', { level: 'info', tags: { form: 'signup', trap: why } });
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

  // A contractor whose address does not exist never gets the confirmation
  // mail, never gets an invitation, and looks to us like someone who signed
  // up and lost interest.
  const emailError = await emailDeliveryError(
    d.email,
    'Your confirmation link and every job invitation go to this address',
  );
  if (emailError) return { error: emailError };

  // Admin addresses are granted admin purely by matching ADMIN_EMAILS, and email
  // confirmation is off — so a self-service signup with an unclaimed admin email
  // would hand out admin. Never let an admin email be registered this way. Mirror
  // the "already registered" response so we don't reveal which addresses are
  // privileged (no admin-email enumeration).
  if (isAdminEmail(d.email)) {
    return { error: 'That email is already registered. Try logging in instead.' };
  }

  // Supabase verifies the Turnstile token when captcha protection is enabled
  // for the project; without a valid token it rejects the signup.
  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;

  // Create the auth user only. The contractor profile is collected afterwards
  // in onboarding (the contractors row has NOT NULL business columns, so it
  // can't exist until those details are supplied).
  // Attribution rides on the auth user until onboarding creates the
  // contractors row (contractors.signup_source). Only filled keys are kept.
  const signupSource = cleanSignupSource(
    Object.fromEntries(SIGNUP_SOURCE_KEYS.map((k) => [k, formData.get(`src_${k}`)])),
  );

  const supabase = await createClient();
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: signupSource ? { signup_source: signupSource } : undefined,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/onboarding`,
      captchaToken,
    },
  });

  if (signUpErr) {
    const msg = signUpErr.message;
    return { error: captchaErrorMessage(msg, 'signup') ?? msg };
  }
  // Supabase obfuscates re-signups (returns a user with no identities). Treat as
  // "email already in use" rather than leaking which addresses are registered.
  if (!signUp.user?.id || (signUp.user && signUp.user.identities?.length === 0)) {
    return { error: 'That email is already registered. Try logging in instead.' };
  }

  // With email confirmation disabled in Supabase, signUp returns a live session
  // and the SSR client has already written the auth cookies — the farmer is
  // signed in, so send them straight to onboarding with no email step. If the
  // project still requires confirmation, there's no session and we fall through
  // to the "check your email" message instead.
  if (signUp.session) {
    // A customer signing up from their job link is not becoming a contractor:
    // onboarding writes a contractors row with NOT NULL business columns and
    // would strand them. Send them back where they came from.
    //
    // Someone coming off the thank-you page has no ?next= to send them back
    // with — the job token lives in a cookie rather than the URL, because the
    // pixel and the analytics tag would otherwise hand it to Facebook and
    // Google as the page address. So look there instead.
    const next = safeInternalPath(String(formData.get('next') ?? ''));
    const justSent = next ? null : await justSentJob();
    if (justSent) {
      // The thank-you page said "add a password and this job is saved to it".
      // Landing them on the job with another button to press would be very
      // nearly keeping that promise. A failure here is not worth blocking on:
      // they arrive at the job page, which still offers the button.
      const claim = await claimJobForUser(signUp.user.id, signUp.user.email, justSent);
      if (!claim.ok) console.error('[signup] auto-claim failed:', claim.reason);
      await forgetJustSentJob();
      redirect(`/my/${justSent}`);
    }
    redirect(next ?? '/onboarding');
  }

  return { ok: true, message: SUCCESS_MESSAGE };
}
