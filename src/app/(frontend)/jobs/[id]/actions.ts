'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

/**
 * Claim a job — first come, first served. The RPC is the race guard: only the
 * first caller flips the job to 'claimed', so exactly one contractor wins it.
 * On success the customer's contact is revealed on the job page.
 */
export async function claimJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return { error: 'Missing job.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('claim_job', { p_job_id: jobId });
  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
  return { ok: true, message: 'This job is yours — contact the customer to arrange the work.' };
}
