'use client';

import { useEffect, useRef } from 'react';
import type { Tab } from './tabs';

/** Ignore touches starting this close to either edge: Android's back gesture lives there. */
const EDGE = 24;
/** How far a release must have travelled to change tab. */
const TRIGGER = 70;

/** Things that take a sideways drag of their own. */
const OWN_DRAG = 'input, textarea, select, [contenteditable], canvas, iframe, [data-no-swipe], .leaflet-container, .maplibregl-map, .mapboxgl-map';

/** True if the touch is inside something that scrolls sideways. */
function insideSidewaysScroller(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Swipe sideways to move between the bottom tabs: right to left for the next
 * tab, left to right for the one before, as the tab bar is laid out. The
 * screen's <main> follows the finger a little so the gesture is felt; a
 * release past the trigger goes to that tab.
 *
 * Only a clearly sideways drag counts (decided on the first real movement,
 * so vertical scrolling is never taken), and never from inside inputs, maps
 * or anything that scrolls sideways itself. Passive listeners; <main> is
 * moved without a React render per touchmove.
 */
export function SwipeTabs({
  tabs,
  currentKey,
  onGo,
}: {
  tabs: Tab[] | null;
  currentKey: string | null;
  onGo: (tab: Tab) => void;
}) {
  const go = useRef(onGo);
  go.current = onGo;

  useEffect(() => {
    if (!tabs || !currentKey) return;
    const i = tabs.findIndex((t) => t.key === currentKey);
    if (i < 0) return;
    const prev = tabs[i - 1] ?? null;
    const next = tabs[i + 1] ?? null;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let swiping = false;
    let dx = 0;
    let main: HTMLElement | null = null;

    const move = (d: number, dragging: boolean) => {
      if (!main) return;
      main.style.transition = dragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease';
      main.style.transform = d ? `translateX(${d * 0.35}px)` : '';
      main.style.opacity = d ? String(1 - Math.min(0.35, Math.abs(d) / 600)) : '';
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      swiping = false;
      dx = 0;
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      if (x < EDGE || x > window.innerWidth - EDGE) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(OWN_DRAG) || target.closest('nav[aria-label="App"]') || insideSidewaysScroller(target)) return;
      if (window.getSelection()?.toString()) return;
      startX = x;
      startY = e.touches[0].clientY;
      main = document.querySelector('main');
      tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const mx = e.touches[0].clientX - startX;
      const my = e.touches[0].clientY - startY;
      if (!swiping) {
        // Decide once: anything more up/down than sideways is a scroll.
        if (Math.abs(my) > 10 && Math.abs(my) * 1.2 > Math.abs(mx)) {
          tracking = false;
          return;
        }
        if (Math.abs(mx) < 14 || Math.abs(mx) < Math.abs(my) * 1.5) return;
        swiping = true;
      }
      dx = mx;
      // Nowhere to go that way: resist, so the end of the row is felt.
      const to = dx < 0 ? next : prev;
      move(to ? dx : dx / 4, true);
    };
    const onEnd = () => {
      if (!swiping) {
        tracking = false;
        return;
      }
      const to = dx <= -TRIGGER ? next : dx >= TRIGGER ? prev : null;
      tracking = false;
      swiping = false;
      move(0, false);
      dx = 0;
      if (to) go.current(to);
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
      move(0, false);
    };
  }, [tabs, currentKey]);

  return null;
}
