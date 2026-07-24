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

/** Relist a withdrawn job — back on the board until someone claims it. */
export async function relistJobAction(formData: FormData) {
  await assertAdmin();
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('jobs')
    .update({
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      bidding_opens_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'withdrawn');
  if (error) throw new Error(error.message);
  await admin.rpc('notify_job_open', { p_job_id: jobId });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath('/admin/jobs');
}
