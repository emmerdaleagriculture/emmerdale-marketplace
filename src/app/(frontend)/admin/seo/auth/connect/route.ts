import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getUser, isAdminEmail } from '@/lib/auth';
import { buildAuthUrl, isGscOAuthConfigured } from '@/lib/gsc';

export const dynamic = 'force-dynamic';

/**
 * GET /admin/seo/auth/connect
 *
 * Admin-gated. Generates a CSRF state token, stashes it in a cookie, then 302s
 * the admin to Google's consent screen. The callback verifies the same state.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (!isAdminEmail(user.email)) return NextResponse.redirect(new URL('/account', req.url));

  if (!isGscOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'OAuth client is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GSC_SITE_URL.',
      },
      { status: 503 },
    );
  }

  const origin = new URL(req.url).origin;
  const state = crypto.randomBytes(24).toString('hex');
  const target = buildAuthUrl(origin, state);

  const res = NextResponse.redirect(target);
  res.cookies.set('gsc_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    maxAge: 600,
    path: '/admin/seo/auth',
  });
  return res;
}
