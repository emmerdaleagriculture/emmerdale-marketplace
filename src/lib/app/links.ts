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

async function plugin() {
  const mod = await import('@capacitor/app');
  return mod.App;
}

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

export async function listenForAppLinks(): Promise<void> {
  if (!isNativeApp() || listening) return;
  try {
    const app = await plugin();
    await app.addListener('appUrlOpen', (event) => goIfOurs(event.url));
    listening = true;
    // A cold start from a link: the system hands the URL over once.
    const launch = await app.getLaunchUrl().catch(() => null);
    goIfOurs(launch?.url);
  } catch (err) {
    console.error('[links] listener failed:', err);
  }
}
