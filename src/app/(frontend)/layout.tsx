import type { Metadata } from 'next';
import { Tenor_Sans, DM_Sans } from 'next/font/google';
import './globals.css';
import { SITE_NAME, SITE_STRAPLINE } from '@/lib/site';

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
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: `${SITE_NAME} — ${SITE_STRAPLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Paddock and land jobs across the country, passed to contractors who can actually do them. The contractor network run by Emmerdale Agriculture Ltd.',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: SITE_NAME,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${tenor.variable} ${dm.variable}`}>
      <body>{children}</body>
    </html>
  );
}
