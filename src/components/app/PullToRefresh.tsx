'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import s from './PullToRefresh.module.css';

/**
 * Pull down from the top of an app screen to reload it.
 *
 * The WebView's own overscroll is switched off in app mode (globals.css,
 * `overscroll-behavior-y: none`, so the page never rubber-bands under the
 * tab bar), which also means there is no native pull-to-refresh. This draws
 * one from touch events instead: a spinner follows the finger down from the
 * top, and letting go past the line runs router.refresh(). That fetches
 * the screen's server data again without a full reload, so scroll position
 * and anything typed survive, and the tab badges are refreshed alongside.
 *
 * The gesture only starts at the very top of the page, never from inside
 * something that scrolls or takes input of its own (a message thread, a
 * text box, the boundary map), and gives way to a sideways swipe.
 */

const MAX = 96; // furthest the spinner travels, px
const TRIGGER = 64; // release past this to refresh, px
const RESIST = 0.5; // finger travel → spinner travel
const MIN_SPIN_MS = 600; // long enough to read as "it did something"

const IGNORE =
  'input, textarea, select, [contenteditable="true"], canvas, .leaflet-container, dialog[open], [data-no-ptr]';

/** True if anything between the target and the page is itself scrolled down. */
function insideScrolledBox(el: Element | null): boolean {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (n.scrollTop > 0) return true;
  }
  return false;
}

export function PullToRefresh({ onRefresh }: { onRefresh?: () => void }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, startTransition] = useTransition();
  const spinStarted = useRef(0);
  const ind = useRef<HTMLDivElement>(null);

  // Hide the spinner once the refresh has landed, but never sooner than
  // MIN_SPIN_MS after it started.
  useEffect(() => {
    if (!refreshing || pending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStarted.current));
    const t = setTimeout(() => {
      setRefreshing(false);
      place(0, false);
    }, wait);
    return () => clearTimeout(t);
  }, [refreshing, pending]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false; // a touch began somewhere a pull may start
    let pulling = false; // and it has turned into a pull
    let dist = 0;
    let busy = false;

    const onStart = (e: TouchEvent) => {
      tracking = false;
      pulling = false;
      dist = 0;
      if (busy || e.touches.length !== 1 || window.scrollY > 0) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(IGNORE) || insideScrolledBox(target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        // Decide once, on the first clear movement: a sideways swipe or a
        // push upwards is not ours.
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          tracking = false;
          return;
        }
        if (dy < -4 || window.scrollY > 0) {
          tracking = false;
          return;
        }
        if (dy < 8) return;
        pulling = true;
      }
      dist = Math.max(0, Math.min(MAX, (dy - 8) * RESIST));
      place(dist, true);
    };

    const onEnd = () => {
      if (!pulling) {
        tracking = false;
        return;
      }
      tracking = false;
      pulling = false;
      if (dist >= TRIGGER) {
        busy = true;
        spinStarted.current = Date.now();
        setRefreshing(true);
        place(TRIGGER, false);
        onRefresh?.();
        startTransition(() => router.refresh());
        // Allow the next pull once this one has had time to finish.
        setTimeout(() => (busy = false), MIN_SPIN_MS);
      } else {
        place(0, false);
      }
      dist = 0;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [router, onRefresh]);

  /** Move the spinner without a React render per touchmove. */
  function place(d: number, dragging: boolean) {
    const el = ind.current;
    if (!el) return;
    el.style.transition = dragging ? 'none' : '';
    el.style.transform = `translate(-50%, ${d - 48}px)`;
    el.style.opacity = d > 0 ? String(Math.min(1, d / (TRIGGER * 0.6))) : '0';
    el.style.setProperty('--ptr-turn', `${Math.min(1, d / TRIGGER) * 270}deg`);
    el.dataset.armed = d >= TRIGGER ? '1' : '0';
  }

  return (
    <div
      ref={ind}
      className={`${s.ptr} ${refreshing ? s.spinning : ''}`}
      role="status"
      aria-live="polite"
      aria-label={refreshing ? 'Refreshing' : undefined}
    >
      <svg className={s.icon} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M20 12a8 8 0 1 1-2.34-5.66"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
