import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { postLoginPath } from '@/lib/auth';

/**
 * Auth callback — exchanges the code from an email confirmation or password
 * recovery link for a session, then redirects on. Used as emailRedirectTo,
 * and since 2026-10-18 as the return leg of Google and Apple sign-in
 * (signInWithOAuth's redirectTo). With no ?next= the person is routed by
 * what they are, as the login form does, rather than dropped on /account.
 */
// Without this Next serves HEAD with the GET handler, and a mail client's
// pre-fetch would spend the code before the person's own click (the token
// hash flow lost two reset links that way on 2026-10-17; see /auth/confirm).
export function HEAD() {
  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = nextParam ?? '/account';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const to =
        nextParam ?? (data.user ? await postLoginPath(data.user.id, data.user.email) : '/account');
      return NextResponse.redirect(`${origin}${to}`);
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
