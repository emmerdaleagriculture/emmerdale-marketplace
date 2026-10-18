import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { postLoginPath, safeInternalPath } from '@/lib/auth';
import { forgetJustSentJob, justSentJob } from '@/lib/jobCookie';
import { claimJobForUser } from '@/lib/customers/claim';
import { APPLE_SERVICES_ID, storeAppleRefreshToken } from '@/lib/apple/tokens';

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
  // Same-site only: this is a redirect target supplied in the URL.
  const nextParam = safeInternalPath(searchParams.get('next'));
  const next = nextParam ?? '/account';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Sign in with Apple on the web: Supabase did the code exchange and
      // hands the refresh token back once, here. Kept so the account can be
      // deleted properly later (Apple requires the token to be revoked).
      // `provider` is the first identity ever used; a later-linked Apple
      // identity shows in `providers`. Without a Services ID there is no
      // client to revoke with, so nothing is stored (and that is logged).
      const rt = data.session?.provider_refresh_token;
      const providers = (data.user?.app_metadata?.providers as string[] | undefined) ?? [];
      const usedApple = data.user?.app_metadata?.provider === 'apple' || providers.includes('apple');
      if (rt && data.user && usedApple) {
        if (APPLE_SERVICES_ID) await storeAppleRefreshToken(data.user.id, rt, APPLE_SERVICES_ID);
        else console.error('[auth] Apple refresh token not stored: APPLE_SERVICES_ID is unset');
      }
      // Off the thank-you page with a job to save: the same claim the
      // password login makes, so Google and Apple keep the promise too.
      if (data.user && !nextParam) {
        const justSent = await justSentJob();
        if (justSent) {
          const claim = await claimJobForUser(data.user.id, data.user.email, justSent);
          if (!claim.ok) console.error('[auth] auto-claim failed:', claim.reason);
          await forgetJustSentJob();
          return NextResponse.redirect(`${origin}/my/${justSent}`);
        }
      }
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
