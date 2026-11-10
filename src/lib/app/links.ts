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
/** Set once this page has started leaving for a link: nothing else may. */
let leaving = false;

const FOLLOWED_KEY = 'ea_app_link_followed';

/** Notes `url` as followed for the life of the WebView. False if it could not. */
export function recordFollowed(url: string): boolean {
  try {
    window.sessionStorage.setItem(FOLLOWED_KEY, url);
    return true;
  } catch (err) {
    console.error('[links] could not record a followed link:', err);
    return false;
  }
}

/**
 * Whether the link the app reports from getLaunchUrl still needs following.
 *
 * getLaunchUrl is not "the link that cold-started the app, once": it answers
 * for the life of the process, and on iOS it is the last link opened at all,
 * warm taps included. Following a link is a full page load that asks again,
 * and a text's /t/<code> redirects elsewhere, so "already there" never
 * matches. Without a record, every load went back to the link: the page
 * reloaded forever, each pass counting another tap. So the launch URL is
 * followed only when it is not the link this WebView last followed, by
 * either path; sessionStorage outlives the page load but not the app.
 * Unreadable storage answers no: missing one deep link beats a reload loop.
 */
export function launchNeedsFollowing(url: string): boolean {
  let last: string | null;
  try {
    last = window.sessionStorage.getItem(FOLLOWED_KEY);
  } catch {
    return false;
  }
  return last !== url;
}

/**
 * Go to `url` if it is ours and not where we are. A warm tap (appUrlOpen) is
 * always a fresh request from the person, even for a link they followed
 * before, so it is followed; the launch path checks launchNeedsFollowing
 * first. Either way the URL is recorded, so the launch path does not follow
 * it again after the reload, and `leaving` stops a second assign while this
 * page unloads (iOS replays a cold start's appUrlOpen as the listener
 * attaches, and getLaunchUrl reports the same link a moment later).
 */
function goIfOurs(url: string | null | undefined): void {
  if (!url || leaving) return;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return;
    recordFollowed(url);
    const here = window.location.pathname + window.location.search + window.location.hash;
    const there = u.pathname + u.search + u.hash;
    if (there !== here) {
      leaving = true;
      window.location.assign(u.toString());
    }
  } catch {}
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
    // A cold start from a link (see launchNeedsFollowing for why it is
    // checked). Followed only once recorded: a link that cannot be noted
    // would be followed again on the next load.
    const launch = await app.getLaunchUrl().catch(() => null);
    if (launch?.url && launchNeedsFollowing(launch.url) && recordFollowed(launch.url)) goIfOurs(launch.url);
  } catch (err) {
    console.error('[links] listener failed:', err);
  }
}
