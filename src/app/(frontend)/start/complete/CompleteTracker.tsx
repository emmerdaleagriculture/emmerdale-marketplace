'use client';

import { useEffect } from 'react';

// Window.fbq / Window.gtag are declared once, in @/components/Analytics.

// Ads conversion label, e.g. "AW-18445155008/AbC-D_efGh12345".
// Empty in every environment until set in Vercel — the send is skipped
// when empty, so merging this changes no behaviour.
const ADS_LEAD_SEND_TO = process.env.NEXT_PUBLIC_ADS_LEAD_LABEL ?? '';

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
    let firedAds = false;
    const tick = () => {
      if (!firedFb && typeof window.fbq === 'function') {
        window.fbq('track', 'Lead');
        firedFb = true;
      }
      if (!firedGa && typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { event_category: 'start' });
        firedGa = true;
      }
      // Google Ads only counts a conversion when the event carries a
      // send_to naming the conversion label. Separate call on purpose.
      if (!firedAds && ADS_LEAD_SEND_TO && typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { send_to: ADS_LEAD_SEND_TO });
        firedAds = true;
      }
      const pending = !firedFb || !firedGa || (!!ADS_LEAD_SEND_TO && !firedAds);
      if (pending && tries++ < 40) setTimeout(tick, 500);
    };
    tick();
  }, []);
  return null;
}
