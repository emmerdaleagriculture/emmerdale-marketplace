import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser, isAdminEmail } from '@/lib/auth';
import { exchangeCodeForTokens, fetchUserEmail, storeRefreshToken, verifyOAuthState } from '@/lib/gsc';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'gsc_oauth_state';
/** Must match connect/: a delete on any other path leaves the cookie alive. */
const STATE_COOKIE_PATH = '/admin/seo/auth';

/**
 * GET /admin/seo/auth/callback
 *
 * Google redirects here after consent. Three checks, all required:
 *   - an admin session. Google's redirect back is a top-level GET, so the
 *     SameSite=Lax Supabase cookies arrive, and middleware refreshes them on
 *     /admin. (The HPM original skipped this on the belief that the cookie
 *     doesn't come back; it does.)
 *   - state = the cookie, tying the callback to the browser that started.
 *   - state carries the server's signature (signOAuthState), which only the
 *     admin-gated connect/ route mints — the cookie alone can be set by anyone.
 * The state cookie is cleared on every exit, so a state is good for one try.
 * Then: code → tokens, store the refresh token, back to the dashboard.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (to: string) => {
    const res = NextResponse.redirect(new URL(to, req.url));
    res.cookies.set(STATE_COOKIE, '', { path: STATE_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return done('/login?next=%2Fadmin%2Fseo');

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) return done(`/admin/seo?gsc_error=${encodeURIComponent(errParam)}`);
  if (!code || !stateParam) return done('/admin/seo?gsc_error=missing_code_or_state');

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== stateParam || !verifyOAuthState(stateParam)) {
    return done('/admin/seo?gsc_error=state_mismatch');
  }

  try {
    const { refreshToken, accessToken } = await exchangeCodeForTokens(code, url.origin);
    const email = await fetchUserEmail(accessToken);
    await storeRefreshToken(refreshToken, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return done(`/admin/seo?gsc_error=${encodeURIComponent(msg)}`);
  }

  return done('/admin/seo?gsc_connected=1');
}
