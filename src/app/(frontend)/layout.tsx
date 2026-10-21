import type { Metadata, Viewport } from 'next';
import { Tenor_Sans, DM_Sans, Inter } from 'next/font/google';
import './globals.css';
import { COMPANY_LEGAL_NAME, SITE_NAME, SITE_STRAPLINE, siteUrl } from '@/lib/site';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { Analytics } from '@/components/Analytics';
import { FirstTouchCapture } from '@/components/FirstTouch';
import { AppShell } from '@/components/app/AppShell';
import { APP_COOKIE, APP_UA_TOKEN } from '@/lib/appMode';

const GA_ID = 'G-869MBRK9FD';
const META_PIXEL_ID = '1714644666891790';

// Typography stack copied from the HPM site so the two brands match.
// Tenor Sans = display headings (gentle, editorial).
// `display: 'optional'` prevents the FOUT-driven CLS on hero headings.
const tenor = Tenor_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'optional',
  adjustFontFallback: true,
});

// DM Sans = body. `swap` was meant to be safe because the metrics are close
// to the fallback, but the enquiry form on the county pages still reflowed
// when it arrived (CLS 0.12, Lighthouse 2026-10-11): close is not identical
// once the text wraps. `optional` ends the swap; a slow first visit keeps the
// fallback, as the display face already does.
const dm = DM_Sans({
  subsets: ['latin'],
  // 800 is the front page's display weight (H1 / big numbers).
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'optional',
  adjustFontFallback: true,
});

// Inter = body on the front page, which pairs it with DM Sans headings.
// Interior pages keep DM Sans body; the variable is only consumed by the
// front page's stylesheet. Not preloaded: on slow mobile the 48 KB preload
// competed with the LCP photo for bandwidth (measured +0.7 s LCP). `optional`
// for the same reason as Tenor above: a late swap reflowed the intro copy
// (CLS 0.06), so the page paints in Inter if it arrives in time and otherwise
// stays in the metric-matched fallback — never both.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'optional',
  adjustFontFallback: true,
  preload: false,
});

export const metadata: Metadata = {
  // Every relative canonical on the site resolves against this, so it goes
  // through siteUrl() — which refuses a localhost value in a production build.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} · ${SITE_STRAPLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Paddock and land jobs across the country, passed to contractors who can actually do them. The contractor network run by ' + COMPANY_LEGAL_NAME + '.',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: SITE_NAME,
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  // Proves the domain to Meta so the ads account can own it — without this,
  // conversion events from /start can't be attributed. Rendered as
  // <meta name="facebook-domain-verification" content="…"> on every page;
  // Meta only reads it on the root, but it costs nothing to carry site-wide
  // and survives someone pointing the verification at a different path.
  verification: {
    other: {
      'facebook-domain-verification': 'tz4e89ngu5xtoh3brsykbwgr1i5yp0',
    },
  },
};

/**
 * `viewport-fit=cover` lets the page extend under an iPhone's notch and home
 * indicator so the app's own safe-area padding (globals.css, html[data-app])
 * can take over. On the website it changes nothing visible: a normal browser
 * tab already keeps its content inside the safe area.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Runs before anything in <body> paints. The root layout is static, so it
 * cannot ask the server whether this is the app; the user agent is right
 * there in the browser, and marking <html> from it means the website header
 * and footer never flash into view in the frame. The cookie is the desktop
 * preview switch (src/lib/appMode.ts). Kept tiny and dependency-free on
 * purpose: it is inlined into every page.
 */
const APP_MODE_SCRIPT = `(function(){try{var ua=navigator.userAgent||'';if(ua.indexOf('${APP_UA_TOKEN}')>-1||/(^|; )${APP_COOKIE}=1(;|$)/.test(document.cookie)){document.documentElement.setAttribute('data-app','1');document.documentElement.setAttribute('data-platform',/iPhone|iPad|iPod/i.test(ua)?'ios':/Android/i.test(ua)?'android':'web');}}catch(e){}})();`;

/**
 * Same moment, same reason: a session cookie marks html[data-session], and
 * globals.css keeps the signed-in parts of the header invisible until
 * useViewer knows who this is — so a signed-in visitor never watches the
 * signed-out header swap for theirs. No cookie, nothing hidden.
 */
const SESSION_SCRIPT = `(function(){try{if(/(^|;\\s*)sb-[^=]+=/.test(document.cookie))document.documentElement.setAttribute('data-session','1');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={`${tenor.variable} ${dm.variable} ${inter.variable}`}
      // The app-mode script below stamps attributes on <html> before React
      // hydrates; without this React reports the difference on every page.
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: APP_MODE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SESSION_SCRIPT }} />
        {children}
        {/* The app's bottom tab bar and back bar. Renders nothing on the
            website: it waits for html[data-app]. */}
        <AppShell />
        {/* Every page, every visitor — signed in or not, contractor or
            customer. It hides itself on /admin, where the only readers are
            the people it reports to. */}
        <FeedbackWidget />
        <Analytics />
        <FirstTouchCapture />
      </body>
    </html>
  );
}
