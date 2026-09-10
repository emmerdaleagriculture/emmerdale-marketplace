'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
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

const INVOICE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The contractor's invoice for a finished job.
 *
 * By the time this is used the customer has confirmed, the money is held and
 * the payout is owed — the invoice is the last piece of paper between the two.
 * It used to arrive by email or not at all, with nothing on the job saying
 * which, so a payment could sit waiting on something nobody could see.
 *
 * The session says who is asking and the row says whose job it is; those have
 * to agree. A photograph of a paper invoice is as valid as a PDF — most of
 * this network will be standing in a yard with a phone.
 */
export async function uploadInvoiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in to send your invoice.' };

  const submissionId = String(formData.get('submission_id') ?? '');
  const file = formData.get('invoice');
  if (!submissionId) return { error: 'Something went wrong — refresh and try again.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' };
  if (file.size > INVOICE_MAX_BYTES) {
    return { error: 'That file is over 10MB — please send a smaller one.' };
  }
  const ext = INVOICE_TYPES[file.type];
  if (!ext) return { error: 'Send a PDF or a photo (JPG, PNG).' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('id, status, awarded_contractor_id, contact_name')
    .eq('id', submissionId)
    .maybeSingle();
  if (!js) return { error: 'We couldn’t find that job.' };
  if (js.awarded_contractor_id !== user.id) {
    return { error: 'This job isn’t assigned to your account.' };
  }
  if (!['completed', 'paid'].includes(js.status)) {
    return { error: 'Send your invoice once the customer has confirmed the work is done.' };
  }

  // Fixed path per job: sending a corrected invoice replaces the wrong one
  // rather than leaving us holding two and guessing which to pay.
  const path = `${submissionId}/invoice.${ext}`;
  const { error: upErr } = await admin.storage
    .from('contractor-invoices')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) {
    console.error('[sq] invoice upload failed:', upErr);
    return { error: 'That didn’t upload — please try again.' };
  }

  const { error: updErr } = await admin
    .from('job_submissions')
    .update({
      contractor_invoice_path: path,
      contractor_invoice_name: file.name.slice(0, 200),
      contractor_invoice_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (updErr) {
    console.error('[sq] invoice record failed:', updErr);
    return { error: 'Uploaded, but we couldn’t record it — please tell us.' };
  }

  const { data: contractor } = await admin
    .from('contractors')
    .select('business_name')
    .eq('id', user.id)
    .maybeSingle();
  await notifyAdmins(
    `Invoice to pay: ${contractor?.business_name ?? 'a contractor'}`,
    [
      `${contractor?.business_name ?? 'A contractor'} has sent their invoice for the job for ${js.contact_name ?? 'a customer'}. ` +
      `Pay it once the customer's balance shows as cleared on /admin/money.`,
      '',
      `Open it on the job: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/submissions/${submissionId}`,
    ].join('\n'),
  );

  revalidatePath('/won');
  return { ok: true, message: 'Invoice received — thanks. It’s paid once the customer’s balance has cleared.' };
}
