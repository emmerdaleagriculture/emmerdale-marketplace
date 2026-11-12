'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { membershipOf } from '@/lib/membership';
import { TENDER_STATUSES } from '@/lib/tenders/labels';

const Schema = z.object({
  tender_id: z.string().uuid(),
  status: z.enum(['', ...TENDER_STATUSES]),
  notes: z.string().trim().max(2000, 'Keep notes under 2,000 characters.'),
});

export type TenderSaveState = { ok?: true; error?: string };

/**
 * Save an Open member's own status and notes on one tender. The tables are
 * service-role only, so the tier and the patch are checked here: the row
 * must be one sq_tenders_for() would show this contractor.
 */
export async function saveTenderAction(_prev: TenderSaveState, formData: FormData): Promise<TenderSaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are not signed in.' };

  const parsed = Schema.safeParse({
    tender_id: formData.get('tender_id'),
    status: formData.get('status') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That didn’t save.' };

  const [{ data: contractor }, { data: sub }] = await Promise.all([
    supabase.from('contractors').select('status, premium_comped_until, open_comped_until').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, plan, tier, current_period_end').eq('contractor_id', user.id).maybeSingle(),
  ]);
  if (!contractor || contractor.status !== 'approved' || membershipOf(sub, contractor) !== 'open') {
    return { error: 'Council tenders are part of Open membership.' };
  }

  const admin = createServiceRoleClient();
  const { data: mine, error: listErr } = await admin.rpc('sq_tenders_for', { p_contractor_id: user.id });
  if (listErr) return { error: 'That didn’t save. Please try again.' };
  if (!(mine ?? []).some((t) => t.id === parsed.data.tender_id)) {
    return { error: 'That tender is no longer on your list.' };
  }

  const { error } = await admin.from('contractor_tenders').upsert(
    {
      contractor_id: user.id,
      tender_id: parsed.data.tender_id,
      status: parsed.data.status || null,
      notes: parsed.data.notes || null,
      seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'contractor_id,tender_id' },
  );
  if (error) return { error: 'That didn’t save. Please try again.' };
  revalidatePath('/account/tenders');
  return { ok: true };
}
