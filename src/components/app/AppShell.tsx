'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useViewer, type ViewerRole } from '@/components/useViewer';
import { APP_COOKIE, isAppStandalonePath, isAppUserAgent } from '@/lib/appMode';
import { activeTab, isTabRoot, tabsFor, type BadgeKey, type Tab } from './tabs';
import { listenForPushTaps, registerPush } from '@/lib/app/push';
import { listenForAppLinks } from '@/lib/app/links';
import { BackChevron, TabIconSvg } from './AppIcons';
import { SwipeTabs } from './SwipeTabs';
import { PullToRefresh } from './PullToRefresh';
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
// Whether the bar carries Books, remembered like the role so it draws at once.
const BOOKS_KEY = 'ea_books';

function rememberedBooks(): boolean {
  try {
    return localStorage.getItem(BOOKS_KEY) === '1';
  } catch {
    return false;
  }
}

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
  const [books, setBooks] = useState(false);

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
    setBooks(rememberedBooks());
  }, []);

  // The real answer replaces the remembered one. Signed out clears it, so a
  // sign-out followed by a different person signing in never shows the
  // previous person's tabs.
  useEffect(() => {
    if (viewer.signedIn) {
      setRole(viewer.role);
      if (!app) return;
      try {
        localStorage.setItem(ROLE_KEY, viewer.role);
      } catch {}
    }
  }, [viewer, app]);
  useEffect(() => {
    if (!app) return;
    // useViewer starts as signed-out before its lookup; only a confirmed
    // signed-out state (no session cookie at all) should clear the memory.
    if (!viewer.signedIn && !/(^|;\s*)sb-[^=]+=/.test(document.cookie)) {
      setRole(null);
      setBooks(false);
      try {
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(BOOKS_KEY);
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
  // A link that opened the app goes where it points, signed in or not: a
  // job page from a text, a payment's return URL.
  useEffect(() => {
    if (!app) return;
    listenForAppLinks();
  }, [app]);

  const tabs = tabsFor(role, { books });
  const standalone = isAppStandalonePath(pathname);
  const showTabs = app && !standalone && tabs !== null;
  // Back lives in the tab bar at the far right. On a tab's own page it is
  // closed to no width and the four tabs share the bar; on an inner screen it
  // opens and the tabs slide across (AppShell.module.css, .backTabOn).
  const showBack = showTabs && !isTabRoot(tabs, pathname);

  // Tell the stylesheet to make room (globals.css, html[data-app-tabs]).
  useEffect(() => {
    setHtmlFlag('data-app-tabs', showTabs);
    return () => setHtmlFlag('data-app-tabs', false);
  }, [showTabs]);

  // Badge counts: on arrival, on every navigation, and when the app is
  // brought back to the front.
  const refreshBadges = useCallback(() => {
    fetch('/api/app/badges', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: (Badges & { books?: boolean }) | null) => {
        if (!b) return;
        const { books: hasBooks, ...counts } = b;
        setBadges(counts);
        setBooks(Boolean(hasBooks));
        try {
          if (hasBooks) localStorage.setItem(BOOKS_KEY, '1');
          else localStorage.removeItem(BOOKS_KEY);
        } catch {}
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

  // A tapped link answers at once: the tab lights up and a bar runs along
  // the top until the new screen arrives. Without it a tap did nothing
  // visible for the whole server round trip, which read as lag.
  const [pending, setPending] = useState<{ path: string; tab: string | null } | null>(null);
  useEffect(() => setPending(null), [pathname]);
  useEffect(() => {
    if (!pending) return;
    // A navigation that never lands (offline, an error page) must not leave it running.
    const t = setTimeout(() => setPending(null), 12000);
    return () => clearTimeout(t);
  }, [pending]);
  useEffect(() => {
    if (!app) return;
    const onClick = (e: MouseEvent) => {
      // No defaultPrevented check: next/link prevents every click it routes.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      // Same screen (a hash, or only the query: the diary's month arrows)
      // keeps its own feedback; pathname would not change to clear the bar.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      const tab = tabsFor(role, { books })?.find((t) => t.href === url.pathname)?.key ?? null;
      setPending({ path: url.pathname, tab });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [app, role, books]);

  const goBack = () => {
    // A fresh WebView opened straight onto an inner screen (a push, a text
    // link) has nowhere to go back to; the tab it belongs to is the answer.
    if (window.history.length > 1) router.back();
    else router.push(tabs ? (activeTab(tabs, pathname)?.href ?? tabs[0].href) : '/app');
  };

  if (!app) return null;

  const current = tabs ? activeTab(tabs, pathname) : null;
  const shownTab = pending?.tab ?? current?.key;

  return (
    <>
      {pending && <div className={s.progress} role="progressbar" aria-label="Loading" />}
      {showTabs && (
        <SwipeTabs
          tabs={tabs}
          currentKey={current?.key ?? null}
          onGo={(t) => {
            setPending({ path: t.href, tab: t.key });
            router.push(t.href);
          }}
        />
      )}
      {!standalone && <PullToRefresh onRefresh={refreshBadges} />}
      {!standalone && (tabs || role === null) && (
        <nav className={`${s.tabbar} ${tabs ? '' : s.skeleton}`} aria-label="App">
          {(tabs ?? CUSTOMER_PLACEHOLDER).map((t) => {
            const n = t.badge ? badges[t.badge] ?? 0 : 0;
            const on = shownTab === t.key;
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
                {/* Icons only, by choice (2026-11-18); the name stays for screen readers. */}
                <span className={s.srOnly}>{t.label}</span>
                {n > 0 && (
                  <span className={s.badge} aria-label={`${n} new`}>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </Link>
            );
          })}
          {tabs && (
            <button
              type="button"
              className={`${s.tab} ${s.backTab} ${showBack ? s.backTabOn : ''}`}
              onClick={goBack}
              disabled={!showBack}
              aria-hidden={!showBack}
              tabIndex={showBack ? 0 : -1}
            >
              <span className={s.iconWrap}>
                <BackChevron />
              </span>
              <span className={s.srOnly}>Back</span>
            </button>
          )}
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
