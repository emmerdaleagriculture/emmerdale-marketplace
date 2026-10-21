import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CONTACT_EMAIL } from '@/lib/site';
import a from '../auth.module.css';
import { Breadcrumb } from '@/components/Breadcrumb';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Delete your account',
  description: 'How to delete your Emmerdale Agriculture account, and what is deleted or kept.',
  alternates: { canonical: '/delete-account' },
};

/**
 * Public, signed-out page for Google Play's "Delete account URL" (Data
 * safety) and Apple's account-deletion guidance. It must name the app,
 * give the steps, and say what is deleted and what is kept, matching
 * lib/deleteAccount.ts and the retention section of /privacy.
 */
export default function DeleteAccountPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <Breadcrumb tone="light" items={[{ label: 'Delete your account' }]} />
          <h1>Delete your Emmerdale Agriculture account</h1>

          <h2>In the app</h2>
          <ol>
            <li>Open the Emmerdale Agriculture app and sign in.</li>
            <li>Go to <strong>Account</strong>.</li>
            <li>Tap <strong>Delete my account</strong> and confirm.</li>
          </ol>

          <h2>On the website</h2>
          <ol>
            <li>
              Go to <Link href="/app/account/delete">emmerdaleagriculture.com/app/account/delete</Link> and
              sign in with the email address you use for your account.
            </li>
            <li>Confirm that you want to delete it.</li>
          </ol>

          <h2>By email</h2>
          <p>
            If you can’t sign in, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from
            the address on your account and ask us to delete it. We’ll reply within a month.
          </p>

          <h2>What is deleted</h2>
          <ul>
            <li>Your sign-in, and any Apple or Google sign-in link.</li>
            <li>Your name, email address and phone number.</li>
            <li>Your saved devices and notification settings.</li>
            <li>Any open jobs, which are withdrawn, and your place on the contractor network.</li>
          </ul>

          <h2>What is kept, and for how long</h2>
          <p>
            Records of jobs that were priced, booked or paid, with their payments, messages and
            invoices, are kept for six years after the job, because tax and accounting law requires
            financial records for that long. They’re no longer linked to a usable account. Jobs that
            didn’t go ahead are deleted within two years. See our{' '}
            <Link href="/privacy">privacy policy</Link> for the full details.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
