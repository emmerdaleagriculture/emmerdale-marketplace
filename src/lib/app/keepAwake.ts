import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Keeping the screen on while a map is following the machine: iOS stops the
 * page (and its GPS) when the phone locks.
 *
 * In app builds that carry @capacitor-community/keep-awake (added after 1.0.2) the
 * native plugin does it. Otherwise the browser's Screen Wake Lock, which
 * Safari has from iOS 16.4 and the app's web view from iOS 18.4. The lock is
 * dropped whenever the page is hidden, so it is asked for again on return.
 */

type KeepAwakePlugin = { keepAwake(): Promise<void>; allowSleep(): Promise<void> };
const KeepAwake = registerPlugin<KeepAwakePlugin>('KeepAwake');

export type ScreenHold = { how: 'native' | 'web' | 'none'; release: () => void };

export async function holdScreenOn(): Promise<ScreenHold> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('KeepAwake')) {
    try {
      await KeepAwake.keepAwake();
      return { how: 'native', release: () => void KeepAwake.allowSleep().catch(() => {}) };
    } catch {}
  }
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    const ask = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        sentinel = null;
      }
    };
    await ask();
    if (sentinel) {
      const onShow = () => {
        if (!released && document.visibilityState === 'visible') void ask();
      };
      document.addEventListener('visibilitychange', onShow);
      return {
        how: 'web',
        release: () => {
          released = true;
          document.removeEventListener('visibilitychange', onShow);
          void (sentinel as WakeLockSentinel | null)?.release().catch(() => {});
        },
      };
    }
  }
  return { how: 'none', release: () => {} };
}
