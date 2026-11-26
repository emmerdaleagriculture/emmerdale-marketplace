/**
 * Write one article on request, from the review page.
 *
 * The monthly run drafts at most two articles; the rest are saved "deferred"
 * with no draft, and a draft can also fail (budget, time limit, no usable
 * model output). Those rows used to be dead ends: the recommendation was on
 * screen with nothing to press. This drafts the article for one such row,
 * puts it in /admin/notes as an unpublished note, and returns the row to
 * "To review".
 */

import { draftArticle } from './generate';
import { SpendBudget } from './llm';
import { createDraftNote, loadSiteDocs, type Db } from './persist';
import type { Json } from '@/lib/database.types';

/** Per-article spend cap. One Opus draft is roughly $0.20-0.40. */
const WRITE_BUDGET_USD = 1;
/** The draft call must return inside this, leaving time to save within the 300s function limit. */
const WRITE_WINDOW_MS = 200_000;

export type WriteArticleRow = {
  type: string;
  status: string;
  related_note_id: string | null;
  review_notes: string | null;
};

/** The agent's own "on cooldown" stamp: another row already owns the query. */
export function isHeldBack(r: Pick<WriteArticleRow, 'status' | 'review_notes'>): boolean {
  return r.status === 'superseded' && (r.review_notes ?? '').startsWith('Held back');
}

/**
 * Can this row have its article written on request? Only an article
 * recommendation with no note yet, that is still open or that the agent
 * shelved without a draft. A held-back row is not offered: the article for
 * that query belongs to the earlier row it names.
 */
export function canWriteArticle(r: WriteArticleRow): boolean {
  if (r.type !== 'new_article' || r.related_note_id) return false;
  if (r.status === 'pending' || r.status === 'approved') return true;
  return r.status === 'superseded' && !isHeldBack(r);
}

export type WriteArticleResult = { ok: true; noteId: string } | { ok: false; error: string };

export async function writeArticleFor(db: Db, id: number): Promise<WriteArticleResult> {
  const { data: row, error } = await db.from('seo_opportunities').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'Opportunity not found.' };
  // Re-checked here, not just on the page: a second click must not write a second note.
  if (!canWriteArticle(row)) return { ok: false, error: 'This row already has an article, or is not an article recommendation.' };

  let docs: Awaited<ReturnType<typeof loadSiteDocs>>;
  try {
    docs = await loadSiteDocs(db);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const draft = await draftArticle(
    {
      row: {
        query: row.query,
        page: row.target_url ?? undefined,
        clicks: Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
        ctr: Number(row.ctr ?? 0),
        position: Number(row.position ?? 0),
      },
      intent: row.intent ?? 'informational',
      // The stored rationale carries the agent's own "Deferred: …" line; the writer only needs the reason.
      rationale: row.rationale.split('\n').filter((l) => !l.startsWith('Deferred:')).join('\n'),
      existingNotes: docs.filter((d) => d.kind === 'note').map((d) => d.title),
      siteMap: docs.map((d) => ({ path: d.path, title: d.title })),
    },
    new SpendBudget(WRITE_BUDGET_USD, Date.now() + WRITE_WINDOW_MS),
  );
  if (!draft) return { ok: false, error: 'Claude returned no usable draft (timeout, refusal, or missing API key). Try again.' };

  let noteId: string;
  try {
    noteId = await createDraftNote(db, draft);
  } catch (err) {
    return { ok: false, error: `Draft written but the note could not be saved: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Back to "To review", holding the query like any other drafted row.
  const { error: upErr } = await db
    .from('seo_opportunities')
    .update({
      draft_content: draft as unknown as Json,
      related_note_id: noteId,
      status: 'pending',
      deferred: false,
      decided_at: null,
      review_notes: `Article written on request ${new Date().toISOString().slice(0, 10)}.`,
    })
    .eq('id', id);
  if (upErr) return { ok: false, error: `Note ${noteId} created, but the opportunity row was not updated: ${upErr.message}` };
  return { ok: true, noteId };
}
