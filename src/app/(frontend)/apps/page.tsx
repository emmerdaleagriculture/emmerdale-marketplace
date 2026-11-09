import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { GetTheApp } from '@/components/GetTheApp';
import { ANDROID_APP_URL, IOS_APP_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Get the app',
  description: 'The Emmerdale Agriculture app for iPhone and Android.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

/**
 * The one app link emails and texts carry (send-emails/appline.ts). A phone
 * goes straight to its own store; anything else (a desktop reading the
 * email) sees both. /iphone and /android stay as direct redirects.
 */
export default async function AppsPage() {
  const ua = (await headers()).get('user-agent') ?? '';
  if (/Android/i.test(ua)) redirect(ANDROID_APP_URL);
  if (/iPhone|iPad|iPod/i.test(ua)) redirect(IOS_APP_URL);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
        <h1>Get the app</h1>
        <p>Open this page on your phone and it will take you to the right store, or search for Emmerdale Agriculture on the App Store or Google Play.</p>
        <GetTheApp
          title="Emmerdale Agriculture"
          body="For iPhone and Android. Contractors can see new jobs, price them, message customers and send invoices; customers can follow their job and message their contractor."
          hide={false}
        />
      </main>
      <SiteFooter />
    </>
  );
}
