'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

/**
 * First-contact log (§25): the signed-in winner records that they've been in
 * touch. The RPC verifies the job really is theirs; the session supplies who
 * "they" are.
 */
export async function logFirstContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to log contact.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  if (!submissionId) return { error: 'Something went wrong — refresh and try again.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('log_first_contact', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  if (error) {
    console.error('[sq] log_first_contact failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'not_yours') return { error: 'This job isn’t assigned to your account.' };
    return { error: 'This job has moved on — refresh to see its current state.' };
  }
  revalidatePath('/won');
  return { ok: true, message: 'Logged — thanks. Good luck with the job.' };
}

/**
 * "I've finished" (§25): the contractor's half of completion. It does not
 * complete the job — it moves it to completed_by_contractor and asks the
 * customer to confirm, which is what releases payment.
 */
export async function markDoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to update a job.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  if (!submissionId) return { error: 'Something went wrong — refresh and try again.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('mark_completed_by_contractor', {
    p_submission_id: submissionId,
    p_contractor_id: user.id,
  });
  if (error) {
    console.error('[sq] mark_completed_by_contractor failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'not_yours') return { error: 'This job isn’t assigned to your account.' };
    return { error: 'This job has moved on — refresh to see its current state.' };
  }
  revalidatePath('/won');
  return { ok: true, message: 'Marked done — we’ve asked the customer to confirm.' };
}
