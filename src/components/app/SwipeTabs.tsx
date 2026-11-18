'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
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

/** A quick flick this fast (px/ms) changes tab even short of the trigger. */
const FLICK = 0.45;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const OUT_MS = 200;
const IN_MS = 260;

/**
 * Swipe sideways to move between the bottom tabs: right to left for the next
 * tab, left to right for the one before, as the tab bar is laid out. The
 * screen's <main> follows the finger; a release past the trigger (or a quick
 * flick) carries it off the side, and the new tab's <main> slides in from
 * the other side when it arrives, like turning a page. Short of that it
 * springs back.
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
  // Set while a screen has gone off one side and its replacement is due:
  // where the new one should come in from, and the old one to put back if
  // the new one never arrives.
  const incoming = useRef<{ from: number; old: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);

  // A new tab's screen has arrived: slide it in. Every page renders its own
  // <main>, so wait (a few frames at most) until the old one is gone. A layout
  // effect, so the new one is placed off to the side before it is painted.
  useLayoutEffect(() => {
    const inc = incoming.current;
    if (!inc) return;
    let frames = 0;
    let raf = 0;
    const slideIn = () => {
      const main = document.querySelector('main');
      if ((!main || main === inc.old) && frames++ < 30) {
        raf = requestAnimationFrame(slideIn);
        return;
      }
      clearTimeout(inc.timer);
      incoming.current = null;
      if (!main || main === inc.old) {
        reset(inc.old, true);
        return;
      }
      main.style.transition = 'none';
      main.style.transform = `translateX(${inc.from}px)`;
      void main.offsetWidth;
      main.style.transition = `transform ${IN_MS}ms ${EASE}`;
      main.style.transform = '';
      setTimeout(() => reset(main, false), IN_MS + 50);
    };
    slideIn();
    return () => cancelAnimationFrame(raf);
  }, [currentKey]);

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
    let lastX = 0;
    let lastT = 0;
    let v = 0;
    let main: HTMLElement | null = null;

    const onStart = (e: TouchEvent) => {
      tracking = false;
      swiping = false;
      dx = 0;
      v = 0;
      if (incoming.current) return; // mid-turn
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      if (x < EDGE || x > window.innerWidth - EDGE) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(OWN_DRAG) || target.closest('nav[aria-label="App"]') || insideSidewaysScroller(target)) return;
      if (window.getSelection()?.toString()) return;
      startX = lastX = x;
      startY = e.touches[0].clientY;
      lastT = e.timeStamp;
      main = document.querySelector('main');
      tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const x = e.touches[0].clientX;
      const mx = x - startX;
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
      const dt = e.timeStamp - lastT;
      if (dt > 0) v = (x - lastX) / dt;
      lastX = x;
      lastT = e.timeStamp;
      dx = mx;
      if (!main) return;
      // Nowhere to go that way: resist, so the end of the row is felt.
      const to = dx < 0 ? next : prev;
      main.style.transition = 'none';
      main.style.transform = `translateX(${to ? dx : dx / 4}px)`;
    };
    const onEnd = () => {
      if (!swiping) {
        tracking = false;
        return;
      }
      tracking = false;
      swiping = false;
      const m = main;
      const flick = Math.abs(dx) > 24 && Math.abs(v) > FLICK && Math.sign(v) === Math.sign(dx);
      const to = dx <= -TRIGGER || (flick && dx < 0) ? next : dx >= TRIGGER || (flick && dx > 0) ? prev : null;
      dx = 0;
      if (!m) return;
      if (!to) {
        reset(m, true);
        return;
      }
      // Off the side it was going, and the new one comes in from the other.
      const w = window.innerWidth;
      const out = to === next ? -w : w;
      m.style.transition = `transform ${OUT_MS}ms ${EASE}`;
      m.style.transform = `translateX(${out}px)`;
      const timer = setTimeout(() => {
        // The new screen never came (offline, an error): bring this one back.
        if (incoming.current?.old === m) {
          incoming.current = null;
          reset(m, true);
        }
      }, 12000);
      incoming.current = { from: -out, old: m, timer };
      go.current(to);
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
      if (main && main !== incoming.current?.old) reset(main, false);
    };
  }, [tabs, currentKey]);

  return null;
}

/** Put a <main> back where it belongs, sliding there or at once. */
function reset(el: HTMLElement, animate: boolean) {
  el.style.transition = animate ? `transform ${OUT_MS}ms ${EASE}` : '';
  el.style.transform = '';
  if (animate) setTimeout(() => (el.style.transition = ''), OUT_MS + 50);
}
