/**
 * App mode: the native apps are a Capacitor frame around this site, and in
 * that frame the site must read as an app — no website header or footer, a
 * bottom tab bar, safe-area padding. Everything that decides "is this the
 * app?" goes through here, on both sides of the wire.
 *
 * Detection, in order of trust:
 *   1. The frame appends `EmmerdaleApp/<version>` to the WebView's user
 *      agent. The middleware reads it and stamps `x-ea-app: 1` on the
 *      request, so dynamic pages know before they render.
 *   2. A cookie, `ea_app=1`, set by visiting any page with `?app=1` (and
 *      cleared with `?app=0`). For looking at app mode in a desktop browser
 *      or a Playwright run; the frame never needs it.
 *   3. In the browser, Capacitor.isNativePlatform() (src/lib/app/isApp.ts),
 *      which is the only signal that means native plugins are available.
 *
 * Kept free of server-only imports: the middleware and the browser bundle
 * both use it.
 */

export const APP_UA_TOKEN = 'EmmerdaleApp/';
export const APP_COOKIE = 'ea_app';
export const APP_HEADER = 'x-ea-app';

export function isAppUserAgent(ua: string | null | undefined): boolean {
  return !!ua && ua.includes(APP_UA_TOKEN);
}

export type AppPlatform = 'ios' | 'android' | 'web';

/** Which phone the frame is on, from its user agent. 'web' when unsure. */
export function platformFromUserAgent(ua: string | null | undefined): AppPlatform {
  if (!ua) return 'web';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

/**
 * The app's own version, from the user-agent token: "EmmerdaleApp/1.2.0" →
 * "1.2.0". Null outside the frame.
 */
export function appVersionFromUserAgent(ua: string | null | undefined): string | null {
  const m = ua?.match(/EmmerdaleApp\/([\w.-]+)/);
  return m ? m[1] : null;
}

/**
 * Routes that stand on their own in the app: the welcome screen and the
 * sign-in / role / phone steps. No tab bar, no back bar — each one draws its
 * own. The auth pages are here too: the app reaches /login only by accident
 * (an old emailed link) and a tab bar under a login form is wrong.
 */
export function isAppStandalonePath(pathname: string): boolean {
  return (
    pathname === '/app' ||
    pathname.startsWith('/app/sign-in') ||
    pathname.startsWith('/app/role') ||
    pathname.startsWith('/app/phone') ||
    pathname.startsWith('/app/email') ||
    pathname.startsWith('/app/notify') ||
    pathname.startsWith('/app/location') ||
    pathname.startsWith('/app/new-job') ||
    pathname.startsWith('/app/apply') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/admin') ||
    // The job flow has its own fixed button at the foot of the screen.
    pathname.startsWith('/start')
  );
}
