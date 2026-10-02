'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import type { FormState } from '@/lib/form';

const REASONS = new Set(['done_elsewhere', 'booked_direct', 'not_needed', 'other']);

/**
 * The customer withdraws an open job (20261002140000_withdraw_and_close).
 * The job comes from the token; a named contractor comes from one of the
 * job's own invitations, never from a free id.
 */
export async function withdrawJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const invitationId = String(formData.get('invitation_id') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is no longer valid.' };
  if (!REASONS.has(reason)) return { error: 'Tell us why first.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('id, status')
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  if (!js) return { error: 'This link is no longer valid.' };

  let contractorId: string | null = null;
  if (reason === 'booked_direct' && /^[0-9a-f-]{36}$/i.test(invitationId)) {
    const { data: inv } = await admin
      .from('job_invitations')
      .select('contractor_id')
      .eq('id', invitationId)
      .eq('submission_id', js.id)
      .maybeSingle();
    contractorId = inv?.contractor_id ?? null;
  }

  const { data, error } = await admin.rpc('sq_withdraw_job', {
    p_submission_id: js.id,
    p_reason: reason,
    p_contractor_id: contractorId ?? undefined,
  });
  const res = data as { ok: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    if (error) console.error('[sq] withdraw failed:', error.message);
    return {
      error:
        res?.reason === 'not_open'
          ? 'This job has moved on — once it is booked, cancel it from the booking instead.'
          : 'That didn’t work — please try again, or reply to any email from us.',
    };
  }
  revalidatePath(`/my/${token}`);
  return { ok: true, message: 'Withdrawn. The contractors who priced it have been told. Thanks for letting us know.' };
}
