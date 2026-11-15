/**
 * The monthly run: GSC → triage → classify → collision → cooldown gates →
 * cluster → fetch pages → draft → persist → outcome check.
 *
 * Ported from hpm-site's agent after its first six months (PR #58): drafts
 * read the live page, same-page variants share one draft, split queries are
 * flagged, and shipped changes are re-measured. Persistence is per
 * opportunity, so a run cut short keeps what it finished. The gates are
 * reads, so a dry run applies them too and shows what the cooldown holds.
 */

import { gscQuery, isoDaysAgo } from '@/lib/gsc';
import { siteUrl } from '@/lib/site';
import { findCollision } from './collision';
import { classify, draftArticle, draftMetaRewrite, draftOnPageTweak, type SitePage } from './generate';
import { SpendBudget } from './llm';
import { reviewOutcomes } from './outcomes';
import { fetchPageContext, type PageContext } from './pageContext';
import {
  absoluteUrl,
  createDraftNote,
  findActivePrior,
  findExistingOpportunity,
  insertOpportunity,
  loadSiteDocs,
  type Db,
} from './persist';
import { articleScore, groupByQuery, isBrandQuery, triageRow } from './triage';
import {
  expectedCtrForPosition,
  isoWeekLabel,
  type AgentRunSummary,
  type Classification,
  type DraftContent,
  type Opportunity,
  type OpportunityType,
  type QueryRow,
} from './types';

export type RunOptions = {
  dryRun?: boolean;
  /** USD soft cap on Claude spend per run. */
  budgetUsd?: number;
  /** Max new article drafts per run; the rest are recorded as deferred. */
  articleCap?: number;
  /** Stop starting drafts after this many ms, leaving time to persist (function limit is 300s). */
  draftDeadlineMs?: number;
  now?: Date;
};

const LOOKBACK_DAYS = 28;
const GSC_LAG_DAYS = 3;
const MAX_CLASSIFY = 60;
const CONCURRENCY = 4;

type WorkItem = {
  type: OpportunityType;
  row: QueryRow;
  classification: Classification;
  deferred?: boolean;
  members?: WorkItem[];
};

/** Run fn over items, at most `limit` at a time, preserving order of results. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function runAgent(db: Db, opts: RunOptions = {}): Promise<AgentRunSummary> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const runId = `run_${started}`;
  const weekIdentified = isoWeekLabel(now);
  const budget = new SpendBudget(opts.budgetUsd ?? 2.5, started + 270_000);
  const articleCap = opts.articleCap ?? 2;
  const draftDeadline = started + (opts.draftDeadlineMs ?? 200_000);
  const errors: string[] = [];
  const gscRange = { start: isoDaysAgo(GSC_LAG_DAYS + LOOKBACK_DAYS), end: isoDaysAgo(GSC_LAG_DAYS) };

  const summary: AgentRunSummary = {
    runId,
    weekIdentified,
    dryRun,
    gscRange,
    counts: { rowsFromGsc: 0, candidates: 0, classified: 0, metaRewrites: 0, onPageTweaks: 0, newArticles: 0, deferred: 0, heldBack: 0 },
    opportunities: [],
    heldBack: [],
    outcomes: [],
    spendUsd: 0,
    errors,
  };

  // 1) Search Console: 28 days of (query, page).
  let rows: Awaited<ReturnType<typeof gscQuery>>;
  try {
    rows = await gscQuery({ startDate: gscRange.start, endDate: gscRange.end, dimensions: ['query', 'page'], rowLimit: 1000 });
  } catch (err) {
    errors.push(`GSC pull failed: ${msg(err)}`);
    return summary;
  }
  summary.counts.rowsFromGsc = rows.length;

  // 2) What the site has: link targets and collision candidates.
  let docs: Awaited<ReturnType<typeof loadSiteDocs>>;
  try {
    docs = await loadSiteDocs(db);
  } catch (err) {
    errors.push(`Site inventory failed: ${msg(err)}`);
    return summary;
  }
  const origin = rows.find((r) => r.keys?.[1])?.keys?.[1]?.match(/^https?:\/\/[^/]+/)?.[0] ?? siteUrl();
  const siteMap: SitePage[] = docs.map((d) => ({ path: d.path, title: d.title }));
  const existingNotes = docs.filter((d) => d.kind === 'note').map((d) => d.title);

  // 3) Triage. The brand is most of the clicks and lands where it should.
  const grouped = groupByQuery(rows);
  const candidates = grouped
    .filter((r) => !isBrandQuery(r.query))
    .map((row) => ({ row, verdict: triageRow(row) }))
    .flatMap((c) => (c.verdict.candidate ? [{ row: c.row, type: c.verdict.type }] : []))
    .sort((a, b) => b.row.impressions - a.row.impressions)
    .slice(0, MAX_CLASSIFY);
  summary.counts.candidates = candidates.length;

  // 4) Classify (Haiku). The type comes from triage's position bands; the
  //    classifier only supplies intent and the skip decision.
  const classified = await pool(candidates, CONCURRENCY, async (c) => {
    if (budget.exceeded()) return null;
    const cls = await classify(c.row, budget);
    if (!cls) errors.push(`Classify "${c.row.query}" failed`);
    return cls ? { ...c, classification: cls } : null;
  });
  summary.counts.classified = classified.filter(Boolean).length;

  // 5) Promote: drop skips; navigational queries only earn a snippet
  //    rewrite; never an article for transactional or local intent.
  const promoted: WorkItem[] = [];
  for (const c of classified) {
    if (!c || c.classification.skip) continue;
    const { intent } = c.classification;
    if (intent === 'navigational' && c.type !== 'meta_rewrite') continue;
    if (c.type === 'new_article' && (intent === 'transactional' || intent === 'local')) continue;
    promoted.push({ type: c.type, row: c.row, classification: c.classification });
  }

  // 6) A new article that collides with an existing page becomes a tweak to
  //    that page instead.
  const articles: WorkItem[] = [];
  const others: WorkItem[] = [];
  for (const w of promoted) {
    if (w.type !== 'new_article') {
      others.push(w);
      continue;
    }
    const hit = findCollision(w.row.query, docs);
    if (hit) {
      const page = absoluteUrl(origin, hit.path);
      const otherPages = w.row.otherPages?.filter((p) => p.page !== page);
      others.push({ ...w, type: 'on_page_tweak', row: { ...w.row, page, otherPages: otherPages?.length ? otherPages : undefined } });
    } else articles.push(w);
  }
  articles.sort((a, b) => articleScore(b.row) - articleScore(a.row));
  const work: WorkItem[] = [
    ...others.filter((w) => w.type === 'meta_rewrite'),
    ...others.filter((w) => w.type === 'on_page_tweak'),
    ...articles.slice(0, articleCap),
    ...articles.slice(articleCap).map((w) => ({ ...w, deferred: true })),
  ];

  // 7) Gates: already raised this week → skip; on cooldown → held back.
  const live: WorkItem[] = [];
  for (const item of work) {
    try {
      if (await findExistingOpportunity(db, { weekIdentified, query: item.row.query, type: item.type })) continue;
      const priorId = await findActivePrior(db, item.row.query, now.getTime());
      if (!priorId) {
        live.push(item);
        continue;
      }
      summary.heldBack.push({ query: item.row.query, type: item.type, priorId });
      if (!dryRun) {
        await insertOpportunity(db, buildOpportunity(item, weekIdentified, null), {
          runId,
          status: 'superseded',
          reviewNotes: `Held back: #${priorId} raised or resolved this query within the cooldown.`,
        });
      }
    } catch (err) {
      // Never fall through to drafting: that would duplicate an open row.
      errors.push(`Gate check "${item.row.query}" failed: ${msg(err)}`);
    }
  }
  summary.counts.heldBack = summary.heldBack.length;

  // 8) Cluster same-type, same-page items: GSC splits one intent into many
  //    strings, and each used to get its own draft of much the same section.
  const leads: WorkItem[] = [];
  const byKey = new Map<string, WorkItem>();
  for (const item of live) {
    if (item.type === 'new_article' || !item.row.page) {
      leads.push(item);
      continue;
    }
    const key = `${item.type}|${item.row.page}`;
    const lead = byKey.get(key);
    if (!lead) {
      const fresh: WorkItem = { ...item, members: [] };
      byKey.set(key, fresh);
      leads.push(fresh);
    } else {
      lead.members!.push(item); // work is impression-sorted within type, so the first is the biggest
    }
  }

  // 9) Fetch every lead's page up front, in parallel (10s cap each).
  const pageUrls = Array.from(new Set(leads.filter((w) => w.type !== 'new_article' && w.row.page).map((w) => w.row.page!)));
  const pages = new Map<string, PageContext | null>(
    await Promise.all(pageUrls.map(async (u) => [u, await fetchPageContext(u)] as const)),
  );

  // 10) Draft + persist each lead.
  await pool(leads, 3, async (item) => {
    const generate = !item.deferred && !budget.exceeded() && Date.now() < draftDeadline;
    const page = item.row.page ? (pages.get(item.row.page) ?? null) : null;
    if (generate && item.type !== 'new_article' && !page) {
      errors.push(`Page fetch failed for ${item.row.page}: "${item.row.query}" drafted without the page`);
    }
    let draft: DraftContent | null = null;
    try {
      draft = generate ? await draftFor(item, page, siteMap, existingNotes, budget) : null;
    } catch (err) {
      errors.push(`Draft "${item.row.query}" failed: ${msg(err)}`);
    }
    if (generate && !draft) errors.push(`No draft for "${item.row.query}" (model returned nothing usable)`);
    if (!generate && !item.deferred) errors.push(`"${item.row.query}" not drafted: budget or time limit reached`);
    const opp = buildOpportunity(item, weekIdentified, draft);
    summary.opportunities.push(opp);
    if (dryRun) return;

    let leadId: number;
    try {
      let relatedNoteId: string | undefined;
      if (opp.type === 'new_article' && draft) {
        try {
          relatedNoteId = await createDraftNote(db, draft as Parameters<typeof createDraftNote>[1]);
        } catch (err) {
          errors.push(`Draft note for "${opp.query}" failed: ${msg(err)}`);
        }
      }
      // Nothing to review without a draft. Saved as superseded with no
      // decision, so it doesn't hold the query and comes back next month
      // (as pending it would block the query forever).
      leadId = draft
        ? await insertOpportunity(db, opp, { runId, status: 'pending', relatedNoteId })
        : await insertOpportunity(db, opp, {
            runId,
            status: 'superseded',
            reviewNotes: item.deferred
              ? 'Deferred: over the per-run article cap. Not held back; raised again next run.'
              : 'No draft (budget, time limit, or no usable model output). Not held back; raised again next run.',
          });
    } catch (err) {
      errors.push(`Persist "${opp.query}" failed: ${msg(err)}`);
      return;
    }
    // Variants only start a cooldown when the lead has a draft that covers them.
    for (const member of item.members ?? []) {
      try {
        await insertOpportunity(db, buildOpportunity(member, weekIdentified, null), {
          runId,
          status: 'superseded',
          ...(draft
            ? { decidedAt: new Date().toISOString(), reviewNotes: `Clustered into #${leadId} ("${opp.query}"): same page, one draft.` }
            : { reviewNotes: `Clustered into #${leadId} ("${opp.query}"), which has no draft: not held back.` }),
        });
      } catch (err) {
        errors.push(`Persist variant "${member.row.query}" failed: ${msg(err)}`);
      }
    }
  });

  for (const o of summary.opportunities) {
    if (o.type === 'meta_rewrite') summary.counts.metaRewrites++;
    else if (o.type === 'on_page_tweak') summary.counts.onPageTweaks++;
    else if (o.deferred) summary.counts.deferred++;
    else summary.counts.newArticles++;
  }

  // 11) Did earlier changes work?
  try {
    summary.outcomes = await reviewOutcomes(db, grouped, gscRange, now.getTime());
  } catch (err) {
    errors.push(`Outcome review failed: ${msg(err)}`);
  }

  summary.spendUsd = budget.spentUsd();
  return summary;
}

async function draftFor(
  item: WorkItem,
  page: PageContext | null,
  siteMap: SitePage[],
  existingNotes: string[],
  budget: SpendBudget,
): Promise<DraftContent | null> {
  const related = (item.members ?? []).map((m) => `${m.row.query} (${m.row.impressions} impr, pos ${m.row.position.toFixed(1)})`);
  const competing = (item.row.otherPages ?? []).map((p) => `${p.page} (${p.impressions} impr, pos ${p.position.toFixed(1)})`);
  if (item.type === 'meta_rewrite') {
    return draftMetaRewrite({ row: item.row, related, expectedCtr: expectedCtrForPosition(item.row.position) ?? 0.05, page }, budget);
  }
  if (item.type === 'on_page_tweak') {
    return draftOnPageTweak({ row: item.row, related, competing, page, siteMap }, budget);
  }
  return draftArticle(
    { row: item.row, intent: item.classification.intent, rationale: item.classification.rationale, existingNotes, siteMap },
    budget,
  );
}

function buildOpportunity(item: WorkItem, weekIdentified: string, draft: DraftContent | null): Opportunity {
  const relatedQueries = (item.members ?? []).map((m) => ({
    query: m.row.query,
    impressions: m.row.impressions,
    position: m.row.position,
  }));
  const competingPages = item.row.otherPages ?? [];
  const rationale = [
    item.classification.rationale,
    relatedQueries.length ? `Also covers: ${relatedQueries.map((r) => r.query).join('; ')}.` : '',
    competingPages.length
      ? `SPLIT: Google also shows ${competingPages.map((p) => `${p.page} (${p.impressions} impr)`).join('; ')}. Decide which page owns this query before adding copy.`
      : '',
    item.deferred ? 'Deferred: over the per-run article cap, no draft.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    query: item.row.query,
    type: item.type,
    intent: item.classification.intent,
    weekIdentified,
    metrics: {
      impressions: item.row.impressions,
      clicks: item.row.clicks,
      ctr: item.row.ctr,
      position: item.row.position,
      expectedCtr: item.type === 'meta_rewrite' ? expectedCtrForPosition(item.row.position) : undefined,
    },
    rationale,
    targetUrl: item.row.page,
    draftContent: draft,
    relatedQueries: relatedQueries.length ? relatedQueries : undefined,
    competingPages: competingPages.length ? competingPages : undefined,
    deferred: item.deferred,
  };
}
