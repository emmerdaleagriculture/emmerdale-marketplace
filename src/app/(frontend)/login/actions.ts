'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { postLoginPath, safeInternalPath, type LoginSide } from '@/lib/auth';
import type { FormState } from '@/lib/form';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  // Enabling captcha protection in Supabase covers sign-in too, so the token
  // must be forwarded here as well.
  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error || !data.user) {
    return { error: 'Incorrect email or password, or your email isn’t confirmed yet.' };
  }

  // A ?next= destination (e.g. the job page from a notification email) wins.
  // Failing that, what they have decides, and the side they picked on the
  // form only breaks the tie when they have neither kind of account yet.
  const next = safeInternalPath(String(formData.get('next') || ''));
  const raw = String(formData.get('side') || '');
  const side: LoginSide = raw === 'customer' || raw === 'contractor' ? raw : null;
  redirect(next ?? (await postLoginPath(data.user.id, email, side)));
}
