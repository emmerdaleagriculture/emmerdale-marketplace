'use client';

import { APP_BANNER_COOKIE } from './GetTheApp';
import s from './GetTheApp.module.css';

/**
 * The × on the "Get the app" banner. Hides it at once and sets a year-long
 * cookie so the server leaves it out next time (no flash on load).
 */
export function DismissAppBanner() {
  return (
    <button
      type="button"
      className={s.close}
      aria-label="Dismiss"
      onClick={(e) => {
        document.cookie = `${APP_BANNER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        (e.currentTarget.closest('aside') as HTMLElement | null)?.remove();
      }}
    >
      ×
    </button>
  );
}
