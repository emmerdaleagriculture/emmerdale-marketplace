'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

export async function placeBidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const jobId = String(formData.get('job_id') || '');
  const amountPounds = Number(formData.get('amount'));
  const note = String(formData.get('note') || '').trim() || undefined;

  if (!jobId) return { error: 'Missing job.' };
  if (!amountPounds || amountPounds <= 0) {
    return { error: 'Enter a bid amount greater than zero.' };
  }
  const amount_pence = Math.round(amountPounds * 100);

  const supabase = await createClient();
  const { error } = await supabase.rpc('place_bid', {
    p_job_id: jobId,
    p_amount_pence: amount_pence,
    p_note: note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
  return { ok: true, message: 'Your bid is in. You can revise it until bidding closes.' };
}
