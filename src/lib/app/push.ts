import { appPlatform, isNativeApp } from '@/lib/app/isApp';
import { appVersionFromUserAgent } from '@/lib/appMode';
import { nativePlugin } from '@/lib/app/nativePlugin';
import type { FirebaseMessagingPlugin } from '@capacitor-firebase/messaging';

/**
 * Push notifications, browser side (PRD task 7). The frame carries
 * @capacitor-firebase/messaging; this asks it for the device token and
 * registers it with /api/app/device-token, revokes it on sign-out, and
 * navigates when a notification is tapped. Everything is behind
 * isNativeApp(): on the website these are no-ops.
 */
export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * The native plugin by name, not through the package's own entry point:
 * that entry also registers a web implementation built on the Firebase JS
 * SDK, which this site does not ship (nothing here runs on the web). The
 * frame registers the native side under this name.
 *
 * Boxed by nativePlugin, never returned bare: a plugin proxy resolved as a
 * promise's value is mistaken for a thenable and the await never settles.
 */
function plugin() {
  return nativePlugin(
    () => import('@capacitor/core'),
    ({ registerPlugin }) => registerPlugin<FirebaseMessagingPlugin>('FirebaseMessaging'),
  );
}

export async function pushPermission(): Promise<PushPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const { receive } = await (await plugin()).plugin.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function send(body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch('/api/app/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Get this device's token and record it against the signed-in user. With
 * `ask`, the system prompt is shown if it has not been; without, only a
 * permission already granted is used — which is what every app open does,
 * so last_seen_at and a rotated token stay current.
 */
/** This device's own switch. Permission is per device, so the choice is too. */
const OFF_KEY = 'ea_push_off';
export function pushTurnedOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {}
}

export async function registerPush({ ask }: { ask: boolean }): Promise<PushPermission> {
  if (!isNativeApp()) return 'unavailable';
  // Turned off on this device: the silent re-register on app open stays
  // silent. Asking (the switch, the explainer) turns it back on.
  if (!ask && pushTurnedOff()) return 'prompt';
  if (ask) rememberOff(false);
  try {
    const { plugin: fm } = await plugin();
    let { receive } = await fm.checkPermissions();
    if (receive !== 'granted' && ask) ({ receive } = await fm.requestPermissions());
    if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'prompt';
    const { token } = await fm.getToken();
    if (!token) return 'granted';
    await send({
      token,
      platform: appPlatform(),
      app_version: appVersionFromUserAgent(navigator.userAgent),
    });
    return 'granted';
  } catch (err) {
    console.error('[push] register failed:', err);
    return 'unavailable';
  }
}

/** Forget this device: on sign-out, or when the person turns pushes off. */
export async function revokePush({ remember = false }: { remember?: boolean } = {}): Promise<void> {
  if (!isNativeApp()) return;
  if (remember) rememberOff(true);
  try {
    const { plugin: fm } = await plugin();
    const { token } = await fm.getToken().catch(() => ({ token: '' }));
    if (token) await send({ token, revoke: true });
    await fm.deleteToken().catch(() => {});
  } catch (err) {
    console.error('[push] revoke failed:', err);
  }
}

let listening = false;

/**
 * Open the screen a tapped notification names. The URL is in the message's
 * data (push.ts in the worker puts /t/<code> there, which counts the tap and
 * forwards). Only ever navigates within this site. Also re-registers when
 * Firebase rotates the token.
 */
export async function listenForPushTaps(): Promise<void> {
  if (!isNativeApp() || listening) return;
  try {
    const { plugin: fm } = await plugin();
    await fm.addListener('notificationActionPerformed', (event) => {
      const url = String((event.notification?.data as Record<string, unknown> | undefined)?.url ?? '');
      if (!url) return;
      try {
        const u = new URL(url, window.location.origin);
        if (u.origin === window.location.origin) window.location.assign(u.toString());
      } catch {}
    });
    await fm.addListener('tokenReceived', () => {
      registerPush({ ask: false }).catch(() => {});
    });
    // Only now: a failed attach (bridge not ready yet) is tried again later.
    listening = true;
  } catch (err) {
    console.error('[push] listener failed:', err);
  }
}
