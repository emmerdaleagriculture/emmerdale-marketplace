'use client';

import { useEffect } from 'react';

/**
 * The landing-page beacon: where people clicked, and how far down they got.
 *
 * Everything is a fraction of the document rather than a pixel, so a phone and
 * a 27-inch monitor land in the same coordinate space and can be drawn on one
 * heat overlay. Nothing identifying is collected or sent — the session key is
 * random per tab and exists only so one visitor's ten clicks don't read as ten
 * visitors.
 *
 * Sent once, with sendBeacon, when the tab is hidden. A beacon survives the
 * navigation that a fetch would lose, which is the whole point: the visits
 * worth measuring are the ones that leave.
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

export function PageTracker({ path }: { path: string }) {
  useEffect(() => {
    // Respect the same signal as animation: someone asking for less should get
    // less, not merely quieter.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let session: string;
    try {
      session = Math.random().toString(36).slice(2) + Date.now().toString(36);
    } catch {
      return;
    }

    const events: Event[] = [];
    let deepest = 0;
    let sent = false;

    const docHeight = () =>
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0, 1);

    const onClick = (e: MouseEvent) => {
      if (events.length >= 30) return;
      const dh = docHeight();
      const dw = Math.max(document.documentElement.clientWidth, 1);
      events.push({
        kind: 'click',
        x: Math.min(1, Math.max(0, e.pageX / dw)),
        y: Math.min(1, Math.max(0, e.pageY / dh)),
        vw: window.innerWidth,
        dh,
        label: labelFor(e.target as Element | null),
      });
    };

    const onScroll = () => {
      const dh = docHeight();
      const reached = (window.scrollY + window.innerHeight) / dh;
      deepest = Math.max(deepest, Math.min(1, reached));
    };

    const flush = () => {
      if (sent) return;
      sent = true;
      const dh = docHeight();
      const batch: Event[] = [
        ...events,
        { kind: 'depth', depth: Math.round(deepest * 100), vw: window.innerWidth, dh },
      ];
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

    onScroll();
    window.addEventListener('click', onClick, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    // pagehide is the one that fires reliably on mobile Safari; visibilitychange
    // covers tab switches that never unload.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });

    return () => {
      window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [path]);

  return null;
}
