'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useViewer, type ViewerRole } from '@/components/useViewer';
import { APP_COOKIE, isAppStandalonePath, isAppUserAgent } from '@/lib/appMode';
import { activeTab, isTabRoot, tabsFor, type BadgeKey, type Tab } from './tabs';
import { listenForPushTaps, registerPush } from '@/lib/app/push';
import { BackChevron, TabIconSvg } from './AppIcons';
import s from './AppShell.module.css';

/**
 * The app's chrome, mounted once in the root layout.
 *
 * It renders for everybody and shows for nobody on the website: the
 * stylesheet keeps it `display: none` unless <html data-app>, which the
 * layout's inline script sets from the user agent before the body paints.
 * The root layout is static, so this is the one place the decision can be
 * made without costing the website its CDN cache.
 *
 * Tabs depend on who is signed in (useViewer, the same lookup the site
 * header makes). That takes a round trip, so the last role seen is kept in
 * localStorage and the bar draws from it at once; the lookup then confirms
 * or corrects it. Badge counts come from /api/app/badges and refresh on
 * every navigation and whenever the app comes back to the foreground.
 */

type Badges = Partial<Record<BadgeKey, number>>;

const ROLE_KEY = 'ea_role';
const SITE_TITLE_SUFFIX = / \| Emmerdale Agriculture$/;

function rememberedRole(): ViewerRole | null {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === 'customer' || v === 'contractor' || v === 'both' || v === 'account' ? v : null;
  } catch {
    return null;
  }
}

function setHtmlFlag(name: string, on: boolean) {
  const el = document.documentElement;
  if (on) el.setAttribute(name, '1');
  else el.removeAttribute(name);
}

export function AppShell() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const viewer = useViewer();

  // Only true once the inline script has marked the page as the app.
  const [app, setApp] = useState(false);
  const [role, setRole] = useState<ViewerRole | null>(null);
  const [badges, setBadges] = useState<Badges>({});
  const [title, setTitle] = useState('');

  useEffect(() => {
    // Normally the layout's inline script has already marked <html>. Not on
    // a 404 or an error page: Next serves those as a bare shell and renders
    // the layout in the browser, where an inlined <script> never runs. So
    // decide here as well, and stamp the attribute for the stylesheet.
    const el = document.documentElement;
    const on =
      el.dataset.app === '1' ||
      isAppUserAgent(navigator.userAgent) ||
      new RegExp(`(^|; )${APP_COOKIE}=1(;|$)`).test(document.cookie);
    if (on && el.dataset.app !== '1') el.setAttribute('data-app', '1');
    setApp(on);
    setRole(rememberedRole());
  }, []);

  // The real answer replaces the remembered one. Signed out clears it, so a
  // sign-out followed by a different person signing in never shows the
  // previous person's tabs.
  useEffect(() => {
    if (viewer.signedIn) {
      setRole(viewer.role);
      try {
        localStorage.setItem(ROLE_KEY, viewer.role);
      } catch {}
    }
  }, [viewer]);
  useEffect(() => {
    if (!app) return;
    // useViewer starts as signed-out before its lookup; only a confirmed
    // signed-out state (no session cookie at all) should clear the memory.
    if (!viewer.signedIn && !/(^|;\s*)sb-[^=]+=/.test(document.cookie)) {
      setRole(null);
      try {
        localStorage.removeItem(ROLE_KEY);
      } catch {}
    }
  }, [app, viewer]);

  // Every app open: refresh this device's token (only if permission was
  // already given — the asking is the notify screen's) and listen for taps.
  useEffect(() => {
    if (!app || !viewer.signedIn) return;
    listenForPushTaps();
    registerPush({ ask: false }).catch(() => {});
  }, [app, viewer.signedIn]);

  const tabs = tabsFor(role);
  const standalone = isAppStandalonePath(pathname);
  const showTabs = app && !standalone && tabs !== null;
  const showBack = app && !standalone && !(tabs && isTabRoot(tabs, pathname));

  // Tell the stylesheet to make room (globals.css, html[data-app-tabs]).
  useEffect(() => {
    setHtmlFlag('data-app-tabs', showTabs);
    setHtmlFlag('data-app-back', showBack);
    return () => {
      setHtmlFlag('data-app-tabs', false);
      setHtmlFlag('data-app-back', false);
    };
  }, [showTabs, showBack]);

  // Badge counts: on arrival, on every navigation, and when the app is
  // brought back to the front.
  const refreshBadges = useCallback(() => {
    fetch('/api/app/badges', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Badges | null) => {
        if (b) setBadges(b);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!showTabs) return;
    refreshBadges();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshBadges();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [showTabs, pathname, refreshBadges]);

  // The back bar's title is the page's own <title>, minus the site suffix.
  // Next sets it after navigation, so watch it rather than read it once.
  useEffect(() => {
    if (!showBack) return;
    const read = () => setTitle(document.title.replace(SITE_TITLE_SUFFIX, '').trim());
    read();
    const el = document.querySelector('title');
    if (!el) return;
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [showBack, pathname]);

  const goBack = () => {
    // A fresh WebView opened straight onto an inner screen (a push, a text
    // link) has nowhere to go back to; the tab it belongs to is the answer.
    if (window.history.length > 1) router.back();
    else router.push(tabs ? (activeTab(tabs, pathname)?.href ?? tabs[0].href) : '/app');
  };

  if (!app) return null;

  const current = tabs ? activeTab(tabs, pathname) : null;

  return (
    <>
      {showBack && (
        <div className={s.backbar}>
          <button type="button" className={s.back} onClick={goBack} aria-label="Back">
            <BackChevron />
          </button>
          <span className={s.backTitle}>{title}</span>
        </div>
      )}
      {!standalone && (tabs || role === null) && (
        <nav className={`${s.tabbar} ${tabs ? '' : s.skeleton}`} aria-label="App">
          {(tabs ?? CUSTOMER_PLACEHOLDER).map((t) => {
            const n = t.badge ? badges[t.badge] ?? 0 : 0;
            const on = current?.key === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`${s.tab} ${on ? s.tabOn : ''}`}
                aria-current={on ? 'page' : undefined}
              >
                <span className={s.iconWrap}>
                  <TabIconSvg name={t.icon} />
                </span>
                {t.label}
                {n > 0 && (
                  <span className={s.badge} aria-label={`${n} new`}>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

/** Four blank slots while the role is unknown: the bar's height, nothing in it. */
const CUSTOMER_PLACEHOLDER: Tab[] = [
  { key: 'a', label: '', href: '#', icon: 'home' },
  { key: 'b', label: '', href: '#', icon: 'jobs' },
  { key: 'c', label: '', href: '#', icon: 'messages' },
  { key: 'd', label: '', href: '#', icon: 'account' },
];
