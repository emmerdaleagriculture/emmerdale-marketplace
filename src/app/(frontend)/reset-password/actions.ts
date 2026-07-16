'use server';

import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') || '').trim();
  if (!email) return { error: 'Enter your email address.' };

  // Enabling captcha protection in Supabase covers password recovery too.
  const captchaToken = String(formData.get('cf-turnstile-response') || '') || undefined;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/reset-password/update`,
    captchaToken,
  });

  // Always report success — never reveal whether an address is registered.
  return {
    ok: true,
    message: 'If that email is registered, we’ve sent a link to reset your password.',
  };
}
