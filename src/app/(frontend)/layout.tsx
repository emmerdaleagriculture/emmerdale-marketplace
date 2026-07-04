import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';

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
    default: 'Emmerdale Marketplace',
    template: '%s | Emmerdale Marketplace',
  },
  description: 'A marketplace for the Emmerdale Agriculture community.',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: 'Emmerdale Marketplace',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={dm.variable}>
      <body>{children}</body>
    </html>
  );
}
