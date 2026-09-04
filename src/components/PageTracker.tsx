'use client';

import { useEffect } from 'react';

/**
 * The landing-page beacon: where people clicked, and how far down they got.
 *
 * Everything is a fraction of the document rather than a pixel, so a phone and
 * a 27-inch monitor land in the same coordinate space. Nothing identifying is
 * collected or sent — the session key exists only so one visitor's ten clicks
 * don't read as ten visitors, and it dies with the tab.
 *
 * Sent once, with sendBeacon, when the tab is hidden. A beacon survives the
 * navigation a fetch would lose, which is the point: the visits worth
 * measuring are the ones that leave.
 */

type Event = {
  kind: 'click' | 'depth';
  x?: number;
  y?: number;
  depth?: number;
  vw: number;
  dh: number;
  label?: string;
};

/** A short, stable description of what was clicked — never page text. */
function labelFor(el: Element | null): string | undefined {
  const node = el?.closest('a,button,[role="button"],summary,input,select,textarea');
  if (!node) return undefined;
  const aria = node.getAttribute('aria-label');
  if (aria) return aria.trim().slice(0, 80);
  const href = node.getAttribute('href');
  if (href) return `${node.tagName.toLowerCase()} ${href}`.slice(0, 80);
  const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
  return (text ? `${node.tagName.toLowerCase()} ${text}` : node.tagName.toLowerCase()).slice(0, 80);
}

/**
 * One key per tab, not per mount. /start unmounts this component while a parse
 * is pending and remounts it if the parse fails, so a fresh key per mount would
 * count one frustrated visitor as two visits and deflate every per-visit figure.
 */
function sessionKey(): string | null {
  try {
    const existing = sessionStorage.getItem('ea_sk');
    if (existing) return existing;
    const made = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('ea_sk', made);
    return made;
  } catch {
    return null; // private mode, storage disabled — measure nothing rather than guess
  }
}

export function PageTracker({ path }: { path: string }) {
  useEffect(() => {
    // The admin heat overlay renders these pages in an iframe. Tracking there
    // would let looking at the report manufacture the data it reports — an
    // admin page-load would post a landing view and a 100%-depth visit, since
    // the frame is sized to the whole document.
    if (window.self !== window.top) return;

    // Honour the browser's own do-not-track signals. (prefers-reduced-motion is
    // deliberately NOT used here: it asks for less animation, not less
    // measurement, and gating on it would silently drop the accessibility
    // cohort from the numbers while they still appear in landing_views.)
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
    if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return;

    const session = sessionKey();
    if (!session) return;

    const events: Event[] = [];
    let deepestPx = 0;
    let sent = false;

    const docHeight = () =>
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0, 1);
    const docWidth = () =>
      Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0, 1);

    const onClick = (e: MouseEvent) => {
      if (events.length >= 30) return;
      events.push({
        kind: 'click',
        // Both fractions of the DOCUMENT: pageX against clientWidth overflows
        // past 1 on anything that scrolls sideways and piles up on the clamp.
        x: Math.min(1, Math.max(0, e.pageX / docWidth())),
        y: Math.min(1, Math.max(0, e.pageY / docHeight())),
        vw: window.innerWidth,
        dh: docHeight(),
        label: labelFor(e.target as Element | null),
      });
    };

    // Record the furthest PIXEL reached and turn it into a fraction at flush
    // time. Latching a ratio early would measure against a shorter document —
    // before late images and fonts land — and since it only ever rises, a
    // visitor who never left the fold could be recorded at 100%.
    const onScroll = () => {
      deepestPx = Math.max(deepestPx, window.scrollY + window.innerHeight);
    };

    const flush = () => {
      if (sent) return;
      sent = true;
      const dh = docHeight();
      const depth = Math.round(Math.min(1, Math.max(0, deepestPx / dh)) * 100);
      const batch: Event[] = [...events, { kind: 'depth', depth, vw: window.innerWidth, dh }];
      try {
        navigator.sendBeacon?.(
          '/api/track',
          new Blob([JSON.stringify({ path, session, events: batch })], {
            type: 'application/json',
          }),
        );
      } catch {
        /* a lost beacon is a lost statistic, nothing more */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    onScroll();
    window.addEventListener('click', onClick, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    // pagehide is the one that fires reliably on mobile Safari; visibilitychange
    // covers tab switches that never unload.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [path]);

  return null;
}
