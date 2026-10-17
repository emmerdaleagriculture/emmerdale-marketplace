'use server';

import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeInternalPath } from '@/lib/auth';
import { linkFailedPath } from './linkFailedPath';

/**
 * Spends the one-time token from an email link. Only ever called from the
 * button on /auth/confirm — never on arrival — see the page for why.
 */
export async function confirmLinkAction(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get('token_hash') || '');
  const type = String(formData.get('type') || '') as EmailOtpType | '';
  const next = safeInternalPath(String(formData.get('next') || '')) ?? '/account';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) redirect(next);
    console.warn('[auth/confirm] verify failed:', type, error.message);
  }
  redirect(linkFailedPath(type));
}
