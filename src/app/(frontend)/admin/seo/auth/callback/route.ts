import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForTokens, fetchUserEmail, storeRefreshToken } from '@/lib/gsc';

export const dynamic = 'force-dynamic';

/**
 * GET /admin/seo/auth/callback
 *
 * Google redirects here after consent. No session check — Google's redirect
 * doesn't reliably forward the admin cookie. The CSRF state cookie (httpOnly,
 * same-origin, set by connect/) is the auth: a matching state proves the flow
 * started from a logged-in admin on this server. Exchanges the code for tokens,
 * stores the refresh token, then returns to the dashboard.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return NextResponse.redirect(new URL(`/admin/seo?gsc_error=${encodeURIComponent(errParam)}`, req.url));
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/admin/seo?gsc_error=missing_code_or_state', req.url));
  }

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('gsc_oauth_state')?.value;
  if (!stateCookie || stateCookie !== stateParam) {
    return NextResponse.redirect(new URL('/admin/seo?gsc_error=state_mismatch', req.url));
  }

  try {
    const { refreshToken, accessToken } = await exchangeCodeForTokens(code, url.origin);
    const email = await fetchUserEmail(accessToken);
    await storeRefreshToken(refreshToken, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(new URL(`/admin/seo?gsc_error=${encodeURIComponent(msg)}`, req.url));
  }

  const res = NextResponse.redirect(new URL('/admin/seo?gsc_connected=1', req.url));
  res.cookies.delete('gsc_oauth_state');
  return res;
}
