import type { Metadata } from 'next';
import Link from 'next/link';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CONFIRM_SUCCESS } from '../copy';
import { CompleteTracker } from './CompleteTracker';
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

export default function StartCompletePage() {
  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Field &amp; paddock work</div>
          <h1 className={a.title}>Job sent</h1>
          <div className={a.card}>
            <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
              {CONFIRM_SUCCESS}
            </p>
          </div>
          <p className={a.sub} style={{ marginTop: 24 }}>
            <Link href="/">Back to the front page</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
      <CompleteTracker />
    </div>
  );
}
