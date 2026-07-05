'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

/**
 * "I've booked this" — a paid member who takes a job during the exclusive window
 * flags it. Notifies admin (mark_booked queues the email); does NOT change the
 * job status by itself (acceptance #14).
 */
export async function markBookedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const jobId = String(formData.get('job_id') || '');
  if (!jobId) return { error: 'Missing job.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_booked', { p_job_id: jobId });
  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: 'Thanks — we’ve let the admin know. They’ll close this job off.' };
}
