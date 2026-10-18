import { Capacitor } from '@capacitor/core';
import type { AppPlatform } from '@/lib/appMode';

/**
 * Browser-side app detection.
 *
 * Two questions, kept apart on purpose:
 *
 *   isApp()        Should this page look and behave like the app? True in
 *                  the native frame, and also when app mode has been forced
 *                  for a look (`?app=1`, see src/lib/appMode.ts). Use it for
 *                  layout and navigation decisions.
 *
 *   isNativeApp()  Are Capacitor's native plugins actually there? True only
 *                  inside the frame. Every plugin call (sign-in sheets, push,
 *                  camera, in-app browser) goes behind this, so the website
 *                  keeps working in an ordinary browser.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return true;
  return document.documentElement.dataset.app === '1';
}

/** 'ios' | 'android' in the frame; otherwise a best guess from the user agent. */
export function appPlatform(): AppPlatform {
  if (typeof window === 'undefined') return 'web';
  if (isNativeApp()) {
    const p = Capacitor.getPlatform();
    return p === 'ios' || p === 'android' ? p : 'web';
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}
