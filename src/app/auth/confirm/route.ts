import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeInternalPath } from '@/lib/auth';

/**
 * Email link landing for the token-hash flow — the password reset email
 * points here: /auth/confirm?token_hash=…&type=recovery&next=/reset-password/update
 *
 * Unlike /auth/callback's PKCE code exchange, verifying a token hash needs
 * nothing from the browser that asked for the email. That matters because
 * people request a reset on one device and open the email on another (a
 * laptop, then the Gmail app): the PKCE verifier cookie is only in the first,
 * the exchange fails, and a contractor who asked to reset his password was
 * dropped on the login page with no explanation.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeInternalPath(searchParams.get('next')) ?? '/account';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  // Used, expired or mangled. A reset gets a fresh form to ask again, with
  // the reason on it; anything else the login page's own explanation.
  return NextResponse.redirect(
    type === 'recovery' ? `${origin}/reset-password?error=link` : `${origin}/login?error=link`,
  );
}
