import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth callback — exchanges the code from an email confirmation or password
 * recovery link for a session, then redirects on. Used as emailRedirectTo.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/account';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  // Reset emails sent before /auth/confirm existed still land here, and fail
  // whenever they are opened in a different browser from the one that asked
  // (no PKCE verifier cookie). Send those back to ask again, with the reason.
  if (next === '/reset-password/update') {
    return NextResponse.redirect(`${origin}/reset-password?error=link`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
