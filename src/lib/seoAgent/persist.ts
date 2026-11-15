/**
 * Reads and writes for the SEO agent: the seo_opportunities table, the
 * site inventory (notes + service pages + hubs), and the unpublished note a
 * new_article draft lands in. Service-role client throughout.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { SERVICE_PAGES } from '@/lib/services';
import { normalisePath } from './pageContext';
import type { NewArticleDraft, Opportunity, OpportunityType } from './types';

export type Db = SupabaseClient<Database>;

/** A page the agent may link to or collide with. */
export type SiteDoc = { path: string; title: string; kind: 'note' | 'service' | 'hub' };

/** Hub pages worth linking to. County pages are reached from these, not listed (300+). */
const HUBS: SiteDoc[] = [
  { path: '/start', title: 'Post a job and get prices', kind: 'hub' },
  { path: '/services', title: 'All services', kind: 'hub' },
  { path: '/paddock-maintenance', title: 'Paddock maintenance contractors by county', kind: 'hub' },
  { path: '/hay-bales', title: 'Hay, straw and haylage by county', kind: 'hub' },
  { path: '/tractor-hire', title: 'Tractor hire by county', kind: 'hub' },
  { path: '/agriculturalcontractors', title: 'For contractors: join the network', kind: 'hub' },
  { path: '/cost-per-acre', title: 'What land work costs per acre', kind: 'hub' },
  { path: '/notes', title: 'Notes: articles and guides', kind: 'hub' },
];

export async function loadSiteDocs(db: Db): Promise<SiteDoc[]> {
  const { data, error } = await db
    .from('notes')
    .select('slug, title')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(`notes read failed: ${error.message}`);
  return [
    ...HUBS,
    ...SERVICE_PAGES.map((p) => ({ path: `/services/${p.path}`, title: p.h1, kind: 'service' as const })),
    ...(data ?? []).map((n) => ({ path: `/notes/${n.slug}`, title: n.title, kind: 'note' as const })),
  ];
}

export async function findExistingOpportunity(
  db: Db,
  key: { weekIdentified: string; query: string; type: OpportunityType },
): Promise<number | null> {
  const { data, error } = await db
    .from('seo_opportunities')
    .select('id')
    .eq('week_identified', key.weekIdentified)
    .eq('query', key.query)
    .eq('type', key.type)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * How long a raised or resolved query stays off the pending list. Long enough
 * for a shipped change to be recrawled and show in GSC; short enough that a
 * fix which didn't work comes back. Without it HPM re-raised the same
 * queries every month: 38 of its first 66 opportunities were repeats.
 */
export const COOLDOWN_DAYS = 120;

/**
 * A prior row that holds a query back: any type, still open (pending /
 * approved), or raised within the cooldown whatever its outcome. Superseded
 * rows only count when they carry a decision (decided_at): rows the agent
 * auto-superseded must not renew their own suppression forever.
 */
export async function findActivePrior(db: Db, query: string, now = Date.now()): Promise<number | null> {
  const { data, error } = await db
    .from('seo_opportunities')
    .select('id, status, created_at, decided_at')
    .eq('query', query)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find((r) => holdsQuery(r, now));
  return hit?.id ?? null;
}

/** The cooldown rule, pure so it can be tested. */
export function holdsQuery(
  r: { status: string; created_at: string; decided_at: string | null },
  now = Date.now(),
): boolean {
  if (r.status === 'pending' || r.status === 'approved') return true;
  const recent = Date.parse(r.created_at) > now - COOLDOWN_DAYS * 86_400_000;
  return recent && (r.status !== 'superseded' || r.decided_at !== null);
}

export async function insertOpportunity(
  db: Db,
  opp: Opportunity,
  args: {
    runId: string;
    status: 'pending' | 'superseded';
    decidedAt?: string;
    reviewNotes?: string;
    relatedNoteId?: string;
  },
): Promise<number> {
  const row: Database['public']['Tables']['seo_opportunities']['Insert'] = {
    query: opp.query,
    type: opp.type,
    intent: opp.intent,
    status: args.status,
    week_identified: opp.weekIdentified,
    impressions: opp.metrics.impressions,
    clicks: opp.metrics.clicks,
    ctr: opp.metrics.ctr,
    position: opp.metrics.position,
    expected_ctr: opp.metrics.expectedCtr ?? null,
    rationale: opp.rationale,
    target_url: opp.targetUrl ?? null,
    draft_content: (opp.draftContent ?? null) as Json,
    related_queries: (opp.relatedQueries ?? null) as Json,
    competing_pages: (opp.competingPages ?? null) as Json,
    deferred: Boolean(opp.deferred),
    related_note_id: args.relatedNoteId ?? null,
    review_notes: args.reviewNotes ?? null,
    decided_at: args.decidedAt ?? null,
    agent_run_id: args.runId,
  };
  const { data, error } = await db.from('seo_opportunities').insert(row).select('id').single();
  if (error) {
    // A concurrent run got there first: the unique key makes this a no-op.
    if (error.code === '23505') {
      const id = await findExistingOpportunity(db, { weekIdentified: opp.weekIdentified, query: opp.query, type: opp.type });
      if (id) return id;
    }
    throw new Error(error.message);
  }
  return data.id;
}

/**
 * Put an article draft in /admin/notes as an UNPUBLISHED note. The notes
 * table is markdown-native, so the body needs no conversion (HPM's Payload
 * version had to rebuild raw markdown into Lexical by hand). A taken slug
 * gets a numeric suffix rather than failing.
 */
export async function createDraftNote(db: Db, draft: NewArticleDraft): Promise<string> {
  for (let n = 1; n <= 5; n++) {
    const slug = n === 1 ? draft.slug : `${draft.slug}-${n}`;
    const { data, error } = await db
      .from('notes')
      .insert({
        slug,
        title: draft.title,
        excerpt: draft.metaDescription || null,
        content_md: draft.bodyMarkdown,
        published: false,
      })
      .select('id')
      .single();
    if (!error) return data.id;
    if (error.code !== '23505') throw new Error(error.message);
  }
  throw new Error(`no free slug for ${draft.slug}`);
}

/** Absolute URL for a site path, on the origin GSC reports. */
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${normalisePath(path)}`;
}
