import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { lookupConfirmation } from '@/lib/contractors/emailConfirm';
import { ConfirmEmailForm } from './ConfirmEmailForm';
import a from '../../../auth.module.css';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Where the link from a contractor_email_verify email lands. Opening it
 * changes nothing: mail scanners open links too, so the change waits for the
 * button. The token is the credential, so this works signed out as well —
 * the contractor may be reading it on a phone they have never logged in on.
 */
export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await lookupConfirmation(token);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>For contractors</div>
          <h1 className={a.title}>Confirm your email</h1>
          {c.state === 'ok' ? (
            <>
              <p className={a.sub}>
                Confirm <b>{c.email}</b> as the address for {c.businessName}. We’ll send your
                jobs here, use it for your sign-in, and send any jobs still open in your
                counties straight away.
              </p>
              <ConfirmEmailForm token={token} />
            </>
          ) : (
            <div className={a.card}>
              <p>
                {c.state === 'used'
                  ? 'This link has already been used. If you confirmed your address, you’re all set.'
                  : c.state === 'expired'
                    ? 'This link has expired. Sign in and send yourself a new one from your dashboard.'
                    : 'We don’t recognise this link. Sign in and send yourself a new one from your dashboard.'}
              </p>
              <p>
                <Link href="/account">Go to your dashboard →</Link>
              </p>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
