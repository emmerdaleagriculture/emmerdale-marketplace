'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { writeArticleFor } from '@/lib/seoAgent/writeArticle';

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

/**
 * "Write the article": draft it now for a recommendation that has none (over
 * the monthly cap, or the draft failed). Lands as an unpublished note and the
 * row returns to To review. A failure is written onto the row, because a
 * server-component form has nowhere else to show it.
 */
export async function writeArticleAction(formData: FormData) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const db = createServiceRoleClient();
  const result = await writeArticleFor(db, id);
  if (!result.ok) {
    console.error('[seo-opportunities] write article failed', { id, error: result.error });
    const { error } = await db
      .from('seo_opportunities')
      .update({ review_notes: `Write attempt failed ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC: ${result.error}` })
      .eq('id', id);
    if (error) console.error('[seo-opportunities] could not record the failure:', error);
  }
  revalidatePath('/admin/seo/opportunities');
  revalidatePath('/admin/notes');
}

/**
 * "Publish": put the row's draft note live as written and mark the
 * opportunity done, which starts the cooldown and the 6-week re-measure.
 */
export async function publishArticleAction(formData: FormData) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const db = createServiceRoleClient();
  const { data: opp } = await db.from('seo_opportunities').select('related_note_id, status').eq('id', id).maybeSingle();
  if (!opp?.related_note_id || (opp.status !== 'pending' && opp.status !== 'approved')) {
    console.error('[seo-opportunities] publish ignored', { id, status: opp?.status });
    return;
  }
  const { data: note } = await db
    .from('notes')
    .select('slug, tags, published, published_at')
    .eq('id', opp.related_note_id)
    .maybeSingle();
  if (!note) {
    console.error('[seo-opportunities] publish: note missing', { id });
    return;
  }

  const now = new Date().toISOString();
  if (!note.published) {
    const { error } = await db
      .from('notes')
      .update({ published: true, published_at: note.published_at ?? now, updated_at: now })
      .eq('id', opp.related_note_id);
    if (error) {
      console.error('[seo-opportunities] publish failed:', error);
      return;
    }
  }
  const { error } = await db
    .from('seo_opportunities')
    .update({ status: 'completed', decided_at: now, review_notes: `Published ${now.slice(0, 10)} from Cheatcode.` })
    .eq('id', id);
  if (error) console.error('[seo-opportunities] publish: row not marked done:', error);

  // Same refresh the notes editor does on save.
  revalidateTag('notes');
  revalidatePath('/notes');
  revalidatePath(`/notes/${note.slug}`);
  for (const t of new Set(note.tags ?? [])) revalidatePath(`/notes/tag/${t}`);
  revalidatePath('/admin/notes');
  revalidatePath('/admin/seo/opportunities');
}
