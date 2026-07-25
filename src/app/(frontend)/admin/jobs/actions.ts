'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
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
    .in('status', ['exclusive', 'open']);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}

/** Mark a job filled — the customer has chosen a contractor; off the board. */
export async function completeJobAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({ status: 'completed' })
    .eq('id', jobId)
    .in('status', ['exclusive', 'open']);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}

/** Relist a withdrawn or filled job — back on the board for everyone. */
export async function relistJobAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({
      status: 'open',
      bidding_opens_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['withdrawn', 'completed']);
  if (error) throw new Error(error.message);
  // Clear the idempotency keys so contractors notified at the original posting
  // hear about the relist too — without this, notify_job_open would skip them.
  await admin.from('job_notifications').delete().eq('job_id', jobId).eq('kind', 'new_job');
  await admin.rpc('notify_job_open', { p_job_id: jobId });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}
