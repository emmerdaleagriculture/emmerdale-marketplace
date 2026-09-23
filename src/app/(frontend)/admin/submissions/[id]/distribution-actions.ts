'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { notifyAdmins } from '@/lib/adminNotify';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user;
}

function refresh(id: string) {
  revalidatePath(`/admin/submissions/${id}`);
  revalidatePath('/admin/submissions');
  revalidatePath('/admin/ops');
  revalidatePath('/admin/queues');
}

/**
 * Operator: classify an unmatched submission and send it out. Distribution
 * only runs from `confirmed`, so this is the unmatched queue's exit.
 */
export async function classifyAndDistributeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const serviceId = Number(formData.get('service_id'));
  if (!id || !Number.isInteger(serviceId) || serviceId <= 0) {
    return { error: 'Pick a service first.' };
  }

  const admin = createServiceRoleClient();
  const { error: upErr } = await admin
    .from('job_submissions')
    .update({ service_id: serviceId })
    .eq('id', id)
    .eq('status', 'confirmed');
  if (upErr) return { error: `Could not classify: ${upErr.message}` };

  const { data, error } = await admin.rpc('distribute_submission', { p_submission_id: id });
  if (error) return { error: `Distribution failed: ${error.message}` };
  refresh(id);
  const res = data as { ok: boolean; invited?: number; status?: string };
  return {
    ok: true,
    message:
      res.invited !== undefined
        ? `Classified and sent to ${res.invited} contractor${res.invited === 1 ? '' : 's'}.`
        : `Classified — status now ${res.status ?? 'unchanged'}.`,
  };
}

/**
 * Operator: set or correct a job's service at any stage, without sending it
 * anywhere. Classify & distribute only exists for a confirmed job; once a job
 * is out or awarded its label still matters — it is what the contractor's
 * page, the emails and the homepage board call the work — and a customer's
 * first-mentioned word ("Spraying, rotivating, seeding…") is often not it.
 */
export async function setServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const serviceId = Number(formData.get('service_id'));
  if (!id || !Number.isInteger(serviceId) || serviceId <= 0) return { error: 'Pick a service.' };

  const admin = createServiceRoleClient();
  const { data: before } = await admin
    .from('job_submissions')
    .select('status, service:services(name)')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { error: 'Not found.' };
  const { data: svc } = await admin.from('services').select('name').eq('id', serviceId).maybeSingle();
  if (!svc) return { error: 'Unknown service.' };
  const from = (before.service as { name: string } | null)?.name ?? null;
  if (from === svc.name) return { ok: true, message: 'No change.' };

  const { error } = await admin.from('job_submissions').update({ service_id: serviceId }).eq('id', id);
  if (error) return { error: error.message };
  // job_events refuses an operator action without a reason (§29); the change
  // itself is the reason, and it keeps the old label on record.
  await admin.rpc('log_job_event', {
    p_job_id: id,
    p_event_type: 'service_changed',
    p_from: null,
    p_to: null,
    p_actor_type: 'operator',
    p_actor_id: user.id,
    p_reason: `Service set: ${from ?? '(unclassified)'} → ${svc.name}`,
    p_metadata: { from, to: svc.name },
  });
  refresh(id);
  revalidatePath('/');
  return { ok: true, message: `Service set to ${svc.name}.` };
}

/** Operator: (re-)run distribution for a confirmed submission. */
export async function distributeNowAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('distribute_submission', { p_submission_id: id });
  if (error) return { error: `Distribution failed: ${error.message}` };
  refresh(id);
  const res = data as { ok: boolean; invited?: number; skipped?: boolean; status?: string };
  if (res.skipped) return { error: `Not distributable from status "${res.status}".` };
  return { ok: true, message: `Sent to ${res.invited ?? 0} contractor${res.invited === 1 ? '' : 's'}.` };
}

/** Operator: cancel a job. Reason required and logged (§29). */
export async function cancelJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) return { error: 'A reason is required — it goes in the audit log.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!js) return { error: 'Not found.' };
  if (!['confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment'].includes(js.status)) {
    return { error: `Can’t cancel from status "${js.status}".` };
  }

  const { error: upErr } = await admin
    .from('job_submissions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', js.status);
  if (upErr) return { error: upErr.message };

  await admin
    .from('job_invitations')
    .update({ status: 'closed_stale' })
    .eq('submission_id', id)
    .in('status', ['sent', 'viewed', 'priced']);
  await admin
    .from('client_quotes')
    .update({ status: 'closed' })
    .eq('submission_id', id)
    .in('status', ['active', 'accepted']);
  await admin.rpc('log_job_event', {
    p_job_id: id,
    p_event_type: 'status_change',
    p_from: js.status,
    p_to: 'cancelled',
    p_actor_type: 'operator',
    p_actor_id: user.id,
    p_reason: reason,
    p_metadata: {},
  });
  refresh(id);
  return { ok: true, message: 'Cancelled and logged.' };
}

/**
 * Operator: record first contact on the contractor's behalf (§25).
 *
 * Contact is assumed rather than chased (the ops board no longer flags an
 * awarded job), but the record is still worth having when we learn of it —
 * a contractor who called and never tapped "I've contacted the customer" on
 * /won. This makes the same
 * awarded → contacted move, logged as the operator with the reason — and
 * WITHOUT time_to_first_contact, because the moment we heard about it is not
 * the moment it happened, and the supply-health figures should not pretend
 * otherwise.
 */
export async function markContactedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) return { error: 'Say how you know — it goes in the audit log.' };

  const admin = createServiceRoleClient();
  const { data: updated, error } = await admin
    .from('job_submissions')
    .update({ status: 'contacted' })
    .eq('id', id)
    .eq('status', 'awarded')
    .select('id');
  if (error) return { error: error.message };
  if (!updated?.length) return { error: 'Only an awarded job can be marked contacted.' };

  await admin.rpc('log_job_event', {
    p_job_id: id,
    p_event_type: 'status_change',
    p_from: 'awarded',
    p_to: 'contacted',
    p_actor_type: 'operator',
    p_actor_id: user.id,
    p_reason: reason,
    p_metadata: { recorded_by_operator: true },
  });
  refresh(id);
  return { ok: true, message: 'Marked contacted.' };
}

/** Operator: mark the work complete → triggers the rating request. */
export async function markCompletedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) return { error: 'A reason is required — it goes in the audit log.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('mark_submission_completed', {
    p_submission_id: id,
    p_operator_id: user.id,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  const res = data as { ok: boolean; reason?: string; status?: string };
  if (!res.ok) return { error: `Can’t complete from status "${res.status ?? res.reason}".` };
  refresh(id);
  return { ok: true, message: 'Marked complete — the customer gets a rating request.' };
}

/**
 * Operator: retract a contractor's note from the customer's price card.
 *
 * Nothing reviews a note between the contractor writing it and the customer
 * reading it (submit_contractor_quote publishes in the same transaction), so
 * this is the only control over one that shouldn't have gone out. It clears
 * the published copy on client_quotes; what the contractor actually wrote
 * stays on contractor_quotes, because the log of a complaint is the thing you
 * need when you take it up with them.
 */
export async function clearClientNoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await assertAdmin();
  const submissionId = String(formData.get('submission_id') ?? '');
  const clientQuoteId = String(formData.get('client_quote_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!submissionId || !clientQuoteId) return { error: 'Missing the quote.' };
  // job_events carries `check (actor_type <> 'operator' or reason is not
  // null)` — "an unlogged manual change is indefensible (§29)". A Clear
  // button with no reason is exactly what that constraint is for.
  if (!reason) return { error: 'Say why you are pulling it.' };

  const admin = createServiceRoleClient();
  const { data: before } = await admin
    .from('client_quotes')
    .select('contractor_note')
    .eq('id', clientQuoteId)
    .maybeSingle();

  // Log BEFORE clearing, and refuse to clear if the log fails. The other
  // order leaves the customer-visible change made and unrecorded, which is
  // the state the constraint exists to prevent.
  const { error: logError } = await admin.rpc('log_job_event', {
    p_job_id: submissionId,
    p_event_type: 'note_retracted',
    p_from: null,
    p_to: null,
    p_actor_type: 'operator',
    p_actor_id: user.id,
    p_reason: reason,
    p_metadata: { client_quote_id: clientQuoteId, note: before?.contractor_note ?? null },
  });
  if (logError) {
    console.error('[admin] log_job_event note_retracted failed:', logError);
    return { error: 'Could not record the retraction, so nothing was changed.' };
  }

  const { error } = await admin.rpc('sq_clear_client_note', { p_client_quote_id: clientQuoteId });
  if (error) {
    console.error('[admin] sq_clear_client_note failed:', error);
    return { error: 'Could not clear that note — try again.' };
  }

  refresh(submissionId);
  return { ok: true, message: 'Note cleared.' };
}

/**
 * Operator: delete a job outright — for test jobs and junk, where cancelling
 * would leave a fake customer in the boards forever.
 *
 * admin_delete_submission does the work in one transaction and refuses
 * anything that has reached payment or award: those are financial records,
 * and cancelling is the tool for them. The job's own audit log goes with it,
 * so the record of the delete is an email to the admins instead.
 */
export async function deleteJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertAdmin();
  const id = String(formData.get('submission_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!id) return { error: 'Missing the job.' };
  if (!reason) return { error: 'Say why — it goes in the email that records the delete.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('status, raw_text, postcode, contact_name, contact_email, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!js) return { error: 'Not found — it may already be deleted.' };

  const { data, error } = await admin.rpc('admin_delete_submission', { p_submission_id: id });
  if (error) return { error: `Could not delete: ${error.message}` };
  const res = data as { ok: boolean; reason?: string; status?: string; photo_paths?: string[] };
  if (!res.ok) {
    if (res.reason === 'payments' || res.reason === 'status') {
      return {
        error: `Can’t delete a job at "${res.status}" — it involves money or an award. Cancel it instead.`,
      };
    }
    return { error: 'Not found — it may already be deleted.' };
  }

  // Photos live in storage, outside the transaction. A failure here leaves
  // orphaned files, never a half-deleted job, so it is logged and not fatal.
  if (res.photo_paths?.length) {
    const { error: rmError } = await admin.storage.from('job-photos').remove(res.photo_paths);
    if (rmError) console.error('[admin] job photo removal failed:', rmError.message);
  }

  await notifyAdmins(
    `Job deleted: ${id.slice(0, 8)}`,
    `${user.email} deleted a job.\n\n` +
      `Reason:   ${reason}\n` +
      `Status:   ${js.status}\n` +
      `Created:  ${js.created_at}\n` +
      `Postcode: ${js.postcode ?? '—'}\n` +
      `Contact:  ${js.contact_name ?? '—'} ${js.contact_email ? `<${js.contact_email}>` : ''}\n\n` +
      `Their words:\n${js.raw_text ?? '—'}\n\nSubmission id: ${id}`,
  );

  revalidatePath('/admin/submissions');
  revalidatePath('/admin/ops');
  revalidatePath('/admin/queues');
  revalidatePath('/');
  redirect('/admin/submissions');
}
