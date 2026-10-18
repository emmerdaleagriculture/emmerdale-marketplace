import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { APP_COOKIE, APP_HEADER, isAppUserAgent } from '@/lib/appMode';

export async function middleware(request: NextRequest) {
  // App mode (src/lib/appMode.ts). The frame's user agent is the real
  // signal; `?app=1` / `?app=0` toggles a cookie so app mode can be looked at
  // in an ordinary browser. The decision is stamped onto the request as a
  // header, which is how dynamic pages read it (isAppRequest).
  const toggle = request.nextUrl.searchParams.get('app');
  const cookieOn = request.cookies.get(APP_COOKIE)?.value === '1';
  const app =
    isAppUserAgent(request.headers.get('user-agent')) ||
    toggle === '1' ||
    (cookieOn && toggle !== '0');

  if (app) {
    try {
      request.headers.set(APP_HEADER, '1');
    } catch {
      // Immutable headers on this runtime: the server side falls back to
      // the user agent (isAppRequest), so nothing is lost.
    }
  }

  const response = await updateSession(request);

  if (toggle === '1' || toggle === '0') {
    response.cookies.set(APP_COOKIE, toggle, {
      path: '/',
      maxAge: toggle === '1' ? 60 * 60 * 24 * 30 : 0,
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Only the routes whose server side reads the session. The refresh here
     * exists so Server Components see a live token; a page that never reads
     * one gains nothing from it, and on Vercel middleware runs before the
     * CDN cache, so until 2026-10-01 a signed-in contractor opening the
     * home page or a county page paid a Supabase Auth round trip for a page
     * that was already cached. The browser client keeps its own token fresh
     * on those pages (useViewer).
     *
     * Public, token-addressed and static routes are left out on purpose:
     * /, /notes, the service and county pages, the legal pages. /my/[token]
     * is in because it reads the session to offer "save to your account";
     * /start because its actions do. /api/stripe reads the session; /api/track
     * and the Sentry tunnel (/monitoring) do not.
     *
     * /messages and /quote joined for the app (2026-10-18): the app's tab bar
     * leads to both, and the app-mode header above has to be stamped on
     * every page the app shows.
     */
    '/(account|admin|app|auth|invitations|jobs|login|messages|my|onboarding|quote|reset-password|signup|start|won)(/.*)?',
    '/api/stripe/(.*)',
    '/api/app/(.*)',
  ],
};
