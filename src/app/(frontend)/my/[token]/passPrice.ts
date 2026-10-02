'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import { PASS_REASONS } from '@/lib/sealedQuotes/passReasons';
import type { FormState } from '@/lib/form';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function jobFor(token: string) {
  if (!isTokenFormat(token)) return null;
  const { data } = await createServiceRoleClient()
    .from('job_submissions')
    .select('id')
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  return data;
}

/** The customer passes on one price, or takes a pass back (op = undo). */
export async function passPriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const quoteId = String(formData.get('client_quote_id') ?? '');
  const op = String(formData.get('op') ?? 'pass');
  const reason = String(formData.get('reason') ?? '');
  if (!UUID.test(quoteId)) return { error: 'That didn’t work — please try again.' };
  const js = await jobFor(token);
  if (!js) return { error: 'This link is no longer valid.' };

  const admin = createServiceRoleClient();
  let res: { data: unknown; error: { message: string } | null };
  if (op === 'undo') {
    res = await admin.rpc('sq_unpass_price', { p_submission_id: js.id, p_client_quote_id: quoteId });
  } else {
    if (!PASS_REASONS.some(([v]) => v === reason)) return { error: 'Tell us why first.' };
    res = await admin.rpc('sq_pass_price', { p_submission_id: js.id, p_client_quote_id: quoteId, p_reason: reason });
  }
  const out = res.data as { ok: boolean; reason?: string } | null;
  if (res.error || !out?.ok) {
    if (res.error) console.error('[sq] pass price failed:', res.error.message);
    return { error: out?.reason === 'not_open' ? 'This job has moved on.' : 'That didn’t work — please try again.' };
  }
  revalidatePath(`/my/${token}`);
  return { ok: true };
}
