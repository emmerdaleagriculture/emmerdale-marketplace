import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import { CONFIRM_SUCCESS } from '../copy';
import { CompleteTracker } from './CompleteTracker';
import { justSentJob } from '@/lib/jobCookie';
import a from '../../auth.module.css';
import f from '@/components/forms/forms.module.css';

/**
 * Thank-you page after a job is sent. Exists as its own URL purely so ad
 * platforms can count the conversion on a page view. Noindexed like /start,
 * and robots.txt disallows the whole /start prefix.
 */
export const metadata: Metadata = {
  title: 'Job sent',
  robots: { index: false, follow: false },
};

// Reads the just-sent-job cookie, so it cannot be statically rendered.
export const dynamic = 'force-dynamic';

export default async function StartCompletePage() {
  // Set by confirmJobAction. Absent for anyone who lands here directly, or
  // more than two hours later, and the page simply says less.
  const token = await justSentJob();
  return (
    <div className={a.wrap}>
      <HomeHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Field &amp; paddock work</div>
          <h1 className={a.title}>Job sent</h1>
          <div className={a.card}>
            <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
              {CONFIRM_SUCCESS}
            </p>
          </div>

          {/* The one moment they are certain to be here and certain to care.
              An account set up now is a password on an empty job; set up
              three weeks later it is a password on a job they have to go and
              find the email for. */}
          {token && (
            <div className={a.card} style={{ marginTop: 20 }}>
              <h2 className={a.cardTitle}>Finish setting up your account</h2>
              <p>
                Add a password and this job is saved to it — that&rsquo;s how you
                watch the prices come in, and how you order the same work again
                next year without describing it twice.
              </p>
              <p>
                <Link className={f.btnPrimary} href="/signup?from=job">
                  Choose a password
                </Link>
              </p>
              <p className={a.altLink}>
                Already have one? <Link href="/login">Log in</Link> and we&rsquo;ll
                attach this job to it. Or carry on without an account:{' '}
                <Link href={`/my/${token}`}>see your job</Link> — we&rsquo;ve emailed
                you the link either way.
              </p>
            </div>
          )}

          <p className={a.sub} style={{ marginTop: 24 }}>
            <Link href="/">Back to the front page</Link>
          </p>
        </div>
      </main>
      <HomeFooter />
      <CompleteTracker />
    </div>
  );
}
