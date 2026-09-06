'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isSensitivePath, redactPath } from '@/lib/analyticsPaths';

/**
 * Google Analytics and the Meta pixel, kept away from the pages that carry a
 * job token in their address.
 *
 * Both tags used to sit in the layout, which meant they ran on /my/<token>
 * and /quote/<token> as well. Those tokens are not identifiers, they are
 * keys: the client token opens a customer's job — contact details, prices,
 * the payment link — and the invitation token opens a contractor's quote
 * page. Sending the page address to Google and Facebook was sending them the
 * key, to be held in two analytics accounts and read by anyone with access.
 *
 * A customer reaches their job from an emailed link, which is a fresh
 * document load, so not mounting the tags there removes the exposure
 * outright. For the few in-app navigations into those routes the scripts are
 * already loaded and cannot be unloaded, so the address is redacted before
 * anything is sent and the pixel is not pinged at all.
 */

const GA_ID = 'G-869MBRK9FD';
const META_PIXEL_ID = '1714644666891790';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export function Analytics() {
  const pathname = usePathname();
  // Whether the tags load at all is decided once, by the page actually
  // requested. A later navigation cannot unload a script, so it must not be
  // able to load one either — otherwise a token page would mount the pixel
  // the moment someone clicked through to it.
  const loadable = useRef(!isSensitivePath(pathname));
  const first = useRef(true);
  // The admin heat overlay renders /start and / inside an iframe. Tags in
  // there would count every look at the report as a visit and a PageView —
  // the report manufacturing the traffic it reports. Decided in an effect
  // because the server cannot know it is being framed.
  const [framed, setFramed] = useState<boolean | null>(null);
  useEffect(() => {
    setFramed(window.self !== window.top);
  }, []);

  useEffect(() => {
    if (!loadable.current || framed !== false) return;
    const sensitive = isSensitivePath(pathname);
    const page = redactPath(pathname);

    // Set before anything is sent, so a page_view GA raises on its own — via
    // enhanced measurement's history tracking — carries the redacted address
    // rather than the real one.
    window.gtag?.('set', { page_path: page, page_location: `${location.origin}${page}` });

    if (first.current) {
      first.current = false;
      return; // the inline snippets below already sent the first one
    }
    if (sensitive) return;

    window.gtag?.('event', 'page_view', { page_path: page });
    window.fbq?.('track', 'PageView');
  }, [pathname, framed]);

  if (!loadable.current) return null;

  // Server-rendered whatever happens next: a browser with scripts off never
  // reaches the framed check, and one with scripts on ignores <noscript>.
  const noscript = (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: 'none' }}
        alt=""
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
  if (framed !== false) return noscript;

  return (
    <>
      {/* lazyOnload so they load during idle and don't compete with hydration
          or the LCP hero image. */}
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
      <Script id="ga-gtag" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <Script id="meta-pixel" strategy="lazyOnload">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      {noscript}
    </>
  );
}
