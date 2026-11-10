import { isNativeApp } from '@/lib/app/isApp';

/**
 * Universal links and Android app links, inside the frame.
 *
 * The native projects register www.emmerdaleagriculture.com, so a tap on a
 * text's short link or Stripe's return URL opens the app rather than the
 * browser. Opening the app is all the system does: the WebView stays on
 * whatever page it last showed unless something reads the link and goes
 * there. This does, for a warm app (appUrlOpen) and for a cold start
 * (getLaunchUrl, the link the app was opened with), and only for our own
 * origin: a link anywhere else is left alone.
 *
 * Mirrors listenForPushTaps: attached once, retried on a later call if
 * the bridge was not ready.
 */
let listening = false;

function goIfOurs(url: string | null | undefined): void {
  if (!url) return;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return;
    const here = window.location.pathname + window.location.search + window.location.hash;
    const there = u.pathname + u.search + u.hash;
    if (there !== here) window.location.assign(u.toString());
  } catch {}
}

const LAUNCH_KEY = 'ea_launch_url_followed';

/**
 * True when this app session has already followed `url` as its launch link;
 * otherwise records it and returns false. If storage is unavailable it
 * answers true: missing one deep link is better than a reload loop.
 */
export function launchAlreadyFollowed(url: string): boolean {
  try {
    if (window.sessionStorage.getItem(LAUNCH_KEY) === url) return true;
    window.sessionStorage.setItem(LAUNCH_KEY, url);
    return false;
  } catch {
    return true;
  }
}

export async function listenForAppLinks(): Promise<void> {
  if (!isNativeApp() || listening) return;
  try {
    // Destructured from the module, never resolved as a promise's value: a
    // plugin proxy answers `then` like any other method, so a promise that
    // resolves with one calls it, the runtime rejects ("App.then() is not
    // implemented", Sentry 155101834), and the await never settles.
    // capacitorThenable.test.ts shows it.
    const { App: app } = await import('@capacitor/app');
    await app.addListener('appUrlOpen', (event) => goIfOurs(event.url));
    listening = true;
    // A cold start from a link. getLaunchUrl answers with the same URL for
    // the life of the process, not once, and following it is a full page
    // load that runs this again. A text's link is /t/<code>, which redirects
    // elsewhere, so "already there" never matches: without a record that we
    // followed it, every load sent the app back to it and the page reloaded
    // forever (each pass counting another tap). sessionStorage outlives the
    // page load but not the app, so a later cold start from a link still goes.
    const launch = await app.getLaunchUrl().catch(() => null);
    if (launch?.url && !launchAlreadyFollowed(launch.url)) goIfOurs(launch.url);
  } catch (err) {
    console.error('[links] listener failed:', err);
  }
}
