import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSubmissionByClientToken } from '@/lib/sealedQuotes/data';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { RatingForm } from './RatingForm';
import a from '../../../auth.module.css';

export const metadata: Metadata = {
  title: 'Rate your contractor',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** Post-completion rating (§18a): one per job, optional, never gates payment. */
export default async function RatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const js = await getSubmissionByClientToken(token);
  if (!js) notFound();
  if (!['completed', 'paid'].includes(js.status)) redirect(`/my/${token}`);

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from('contractor_ratings')
    .select('stars, comment')
    .eq('submission_id', js.id)
    .maybeSingle();

  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Your job</div>
          <h1 className={a.title}>How did it go?</h1>
          {existing ? (
            <p className={a.sub}>
              You rated this job {'★'.repeat(existing.stars)}
              {'☆'.repeat(5 - existing.stars)}
              {existing.comment ? ` — “${existing.comment}”` : ''}. Thank you.
            </p>
          ) : (
            <>
              <p className={a.sub}>
                A quick rating helps the next customer choose — and it never affects
                what anyone gets paid.
              </p>
              <RatingForm token={token} />
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
