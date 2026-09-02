'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fires the conversion events once the thank-you page is on screen. The URL
 * itself is the primary signal (ad platforms match on it); these are the
 * belt-and-braces events for the pixel and GA. Both tags load lazily, so
 * retry briefly until they exist.
 */
export function CompleteTracker() {
  useEffect(() => {
    let tries = 0;
    let firedFb = false;
    let firedGa = false;
    const tick = () => {
      if (!firedFb && typeof window.fbq === 'function') {
        window.fbq('track', 'Lead');
        firedFb = true;
      }
      if (!firedGa && typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { event_category: 'start' });
        firedGa = true;
      }
      if ((!firedFb || !firedGa) && tries++ < 40) setTimeout(tick, 500);
    };
    tick();
  }, []);
  return null;
}
