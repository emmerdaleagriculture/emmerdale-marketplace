import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { getWorkPhotos } from '@/lib/sealedQuotes/workPhotos';
import { formatDateTime } from '@/lib/time';
import { WorkPhotos } from './WorkPhotos';
import ui from '@/app/(frontend)/app/app-ui.module.css';

export const metadata: Metadata = { title: 'Before and after photos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * On the job (PRD task 9): the before and after photos, and "Mark job
 * complete" once both are in. Reached from the Diary's "Start job". Works
 * on the website too; it is the contractor's own won job.
 */
export default async function WorkPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/won/${id}/photos`);
  const { data: contractor } = await supabase.from('contractors').select('id').eq('id', user.id).maybeSingle();
  if (!contractor) redirect(await nonContractorPath(user.id));

  // The contractor's own view of the job, through the RLS-backed view.
  const { data: job } = await supabase.from('my_sq_won_jobs').select('id, service, status, postcode, contact_name, awarded_at').eq('id', id).maybeSingle();
  if (!job) notFound();
  const photos = await getWorkPhotos(id);
  const done = ['completed_by_contractor', 'completed', 'paid'].includes(job.status ?? '');

  return (
    <main className={ui.screen}>
      <p className={ui.greeting} style={{ marginTop: 8 }}>
        {[job.contact_name, job.postcode, job.status === 'in_progress' ? 'in progress' : null].filter(Boolean).join(' · ')}
        {job.awarded_at ? ` · booked ${formatDateTime(job.awarded_at)}` : ''}
      </p>
      <h1 className={ui.title}>Before and after photos</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.5, marginTop: -8 }}>
        The customer sees these when they sign off. That&rsquo;s what releases your payment.
      </p>
      <WorkPhotos submissionId={id} photos={photos} done={done} />
    </main>
  );
}
