import type { Metadata } from 'next';
import Script from 'next/script';
import { Tenor_Sans, DM_Sans, Inter } from 'next/font/google';
import './globals.css';
import { COMPANY_LEGAL_NAME, SITE_NAME, SITE_STRAPLINE, siteUrl } from '@/lib/site';

const GA_ID = 'G-869MBRK9FD';

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

// DM Sans = body. Metrics close to the system fallback, so `swap` is safe.
const dm = DM_Sans({
  subsets: ['latin'],
  // 800 is the front page's display weight (H1 / big numbers).
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
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
    default: `${SITE_NAME} — ${SITE_STRAPLINE}`,
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${tenor.variable} ${dm.variable} ${inter.variable}`}>
      <body>{children}</body>
      {/* Google Analytics (gtag.js) — lazyOnload so it loads during idle and
          doesn't compete with hydration or the LCP hero image. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="lazyOnload"
      />
      <Script id="ga-gtag" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </html>
  );
}
