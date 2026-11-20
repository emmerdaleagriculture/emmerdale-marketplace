'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

const NEXT: Record<string, 'approved' | 'completed' | 'rejected' | 'pending'> = {
  approve: 'approved',
  complete: 'completed',
  reject: 'rejected',
  reopen: 'pending',
};

/**
 * Review decision on one opportunity. Every decision stamps decided_at,
 * which is what starts (or, on reopen, clears) the 120-day cooldown and what
 * the outcome check measures from.
 *
 * The decision is bound per button (formAction), not read from the
 * submitter's name/value: a server-action form posts only its fields, so
 * the clicked button's value never arrived and every click did nothing.
 */
export async function decideOpportunityAction(decision: string, formData: FormData) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  const id = Number(formData.get('id'));
  const status = NEXT[decision];
  if (!Number.isInteger(id) || !status) {
    console.error('[seo-opportunities] decision ignored', { id, decision });
    return;
  }
  const note = String(formData.get('note') ?? '').trim();

  const db = createServiceRoleClient();
  const update: { status: typeof status; decided_at: string | null; review_notes?: string } = {
    status,
    decided_at: status === 'pending' ? null : new Date().toISOString(),
  };
  if (note) update.review_notes = note;
  const { error } = await db.from('seo_opportunities').update(update).eq('id', id);
  if (error) console.error('[seo-opportunities] decision failed:', error);
  revalidatePath('/admin/seo/opportunities');
}
