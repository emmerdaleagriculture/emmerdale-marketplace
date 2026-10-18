import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import {
  APP_COOKIE,
  APP_HEADER,
  appVersionFromUserAgent,
  isAppUserAgent,
  platformFromUserAgent,
  type AppPlatform,
} from '@/lib/appMode';

/**
 * Is this request from the app? Server side: reads the header the middleware
 * stamped (src/lib/appMode.ts), then the user agent, then the test cookie.
 *
 * Calling this opts the route into dynamic rendering (it reads the request).
 * Fine on the signed-in pages, which already are; never call it from a page
 * that is meant to be statically cached — the browser-side `isApp()` and the
 * `html[data-app]` stylesheet rules cover those.
 */
export const isAppRequest = cache(async (): Promise<boolean> => {
  const h = await headers();
  if (h.get(APP_HEADER) === '1') return true;
  if (isAppUserAgent(h.get('user-agent'))) return true;
  const c = await cookies();
  return c.get(APP_COOKIE)?.value === '1';
});

/** iPhone or Android, from the user agent. 'web' when neither. */
export const appPlatform = cache(async (): Promise<AppPlatform> => {
  const h = await headers();
  return platformFromUserAgent(h.get('user-agent'));
});

/** The frame's version string, or null outside the app. */
export const appVersion = cache(async (): Promise<string | null> => {
  const h = await headers();
  return appVersionFromUserAgent(h.get('user-agent'));
});
