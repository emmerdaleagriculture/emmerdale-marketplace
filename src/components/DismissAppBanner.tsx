'use client';

import { useLayoutEffect, useRef } from 'react';
import { APP_BANNER_COOKIE } from './GetTheApp';
import { dismissAppBannerAction } from './dismissAppBannerAction';
import s from './GetTheApp.module.css';

const dismissed = () =>
  typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${APP_BANNER_COOKIE}=1`);

/**
 * The × on the "Get the app" banner. Hides it at once, sets a year-long
 * cookie so the server leaves it out next time in this browser (no flash on
 * load), and stamps contractors.app_banner_dismissed_at so it stays closed in
 * the member's other browsers too.
 *
 * The server check alone is not enough: Back/Forward restores the page from
 * the browser's or the router's cache as it was rendered BEFORE the click,
 * banner and all. So the banner also hides itself on mount whenever the
 * cookie is set.
 */
export function DismissAppBanner() {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const hide = () => {
      if (dismissed()) (ref.current?.closest('aside') as HTMLElement | null)?.style.setProperty('display', 'none');
    };
    hide();
    // Safari/Chrome back-forward cache: the page comes back without remounting.
    window.addEventListener('pageshow', hide);
    return () => window.removeEventListener('pageshow', hide);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={s.close}
      aria-label="Dismiss"
      onClick={(e) => {
        document.cookie = `${APP_BANNER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        (e.currentTarget.closest('aside') as HTMLElement | null)?.style.setProperty('display', 'none');
        void dismissAppBannerAction().catch(() => {});
      }}
    >
      ×
    </button>
  );
}
