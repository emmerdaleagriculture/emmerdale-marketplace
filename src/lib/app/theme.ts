/**
 * The app's light/dark choice (Settings › Appearance). Kept on this device in
 * localStorage, which the inline script in the root layout reads before
 * paint to stamp html[data-theme]; 'system' (nothing stored) follows the
 * phone. Shared with that script, so no imports beyond plain values here.
 */
export const THEME_KEY = 'ea-theme';
export type ThemePref = 'system' | 'light' | 'dark';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  (window as Window & { __eaTheme?: () => void }).__eaTheme?.();
}
