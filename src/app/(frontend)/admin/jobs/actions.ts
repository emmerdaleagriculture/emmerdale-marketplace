'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
}

/** Extend how long an unclaimed job stays available. */
export async function extendCloseAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  const closesAt = String(formData.get('closes_at') || '');
  const when = new Date(closesAt);
  if (!jobId || isNaN(when.getTime())) throw new Error('Invalid time');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({ bidding_closes_at: when.toISOString() })
    .eq('id', jobId)
    .eq('status', 'open');
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/jobs/${jobId}`);
}

/** Withdraw a job (never reaches / leaves the board). */
export async function withdrawJobAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({ status: 'withdrawn' })
    .eq('id', jobId)
    .in('status', ['exclusive', 'open', 'expired']);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}

/** Relist an expired/withdrawn job with a fresh 24h availability window. */
export async function relistJobAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) throw new Error('Invalid request');

  const now = new Date();
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      bidding_opens_at: now.toISOString(),
      bidding_closes_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['expired', 'withdrawn']);
  if (error) throw new Error(error.message);
  await admin.rpc('notify_job_open', { p_job_id: jobId });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}
