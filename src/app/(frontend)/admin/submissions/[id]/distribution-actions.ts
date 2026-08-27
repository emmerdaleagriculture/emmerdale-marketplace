'use server';

import { revalidatePath } from 'next/cache';
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
