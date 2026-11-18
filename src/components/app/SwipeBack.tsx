'use client';

import { useEffect, useRef } from 'react';
import s from './SwipeBack.module.css';

/** How close to the left edge a swipe must start, and how far it must travel. */
const EDGE = 28;
const TRIGGER = 80;
const MAX = 110;

/**
 * Swipe in from the left edge to go back, on iPhone. Android needs none: its
 * own back gesture reaches the WebView's history already. The frame's
 * WKWebView leaves Apple's swipe off, so this draws its own: a chevron that
 * follows the finger and, past the trigger, goes back on release (the same
 * as the tab bar's Back). Only on inner screens, where Back is shown.
 *
 * Touch listeners are passive and the chevron moves without a React render
 * per touchmove, so scrolling is unaffected.
 */
export function SwipeBack({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  const ind = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;

  useEffect(() => {
    if (!enabled || document.documentElement.dataset.platform !== 'ios') return;
    let startX = 0;
    let startY = 0;
    let tracking = false; // began at the edge
    let swiping = false; // and turned out to be sideways
    let dist = 0;

    const place = (d: number, dragging: boolean) => {
      const el = ind.current;
      if (!el) return;
      el.style.transition = dragging ? 'none' : '';
      el.style.transform = `translate(${Math.min(d, MAX) - 56}px, -50%)`;
      el.style.opacity = d > 0 ? String(Math.min(1, d / (TRIGGER * 0.6))) : '0';
      el.dataset.armed = d >= TRIGGER ? '1' : '0';
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      swiping = false;
      dist = 0;
      if (e.touches.length !== 1 || e.touches[0].clientX > EDGE) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!swiping) {
        // Decide once, on the first clear movement: up/down is a scroll.
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          tracking = false;
          return;
        }
        if (dx < 10) return;
        swiping = true;
      }
      dist = Math.max(0, dx - 10);
      place(dist, true);
    };
    const onEnd = () => {
      if (!swiping) {
        tracking = false;
        return;
      }
      const go = dist >= TRIGGER;
      tracking = false;
      swiping = false;
      dist = 0;
      place(0, false);
      if (go) back.current();
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
      place(0, false);
    };
  }, [enabled]);

  return (
    <div ref={ind} className={s.chevron} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </div>
  );
}
