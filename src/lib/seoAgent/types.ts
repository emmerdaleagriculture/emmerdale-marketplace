/**
 * Shared types for the monthly SEO agent (ported from hpm-site 9b3d71f).
 *
 * Pipeline: GSC rows → grouped per query → triaged by position band →
 * classified (Haiku) → collision check → cooldown gates → clustered per page
 * → drafted (Opus, grounded in the live page) → persisted to
 * seo_opportunities → digest email.
 */

export type Intent = 'transactional' | 'navigational' | 'commercial' | 'informational' | 'local';

export type OpportunityType = 'meta_rewrite' | 'on_page_tweak' | 'new_article';

export type PageShare = { page: string; impressions: number; position: number };

/** One GSC query, keyed to the page that holds most of its impressions. */
export type QueryRow = {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /**
   * Other site URLs Google served for this query with meaningful volume.
   * Non-empty means the query is split between pages: cannibalisation.
   */
  otherPages?: PageShare[];
};

export type Classification = {
  intent: Intent;
  skip: boolean;
  rationale: string;
};

export type MetaRewriteDraft = {
  alternatives: Array<{ title: string; meta: string; rationale: string }>;
};

export type OnPageTweakDraft = {
  newH2: string;
  newH2Body: string;
  /** `path` is a full site path from the site map, e.g. "/services/hedge-cutting". */
  internalLinksToAdd: Array<{ anchor: string; path: string; reason: string }>;
  faqAdditions: Array<{ question: string; answer: string }>;
  rationale: string;
};

export type NewArticleDraft = {
  title: string;
  metaDescription: string;
  slug: string;
  bodyMarkdown: string;
};

export type DraftContent = MetaRewriteDraft | OnPageTweakDraft | NewArticleDraft;

export type Opportunity = {
  query: string;
  type: OpportunityType;
  intent: Intent;
  weekIdentified: string;
  metrics: { impressions: number; clicks: number; ctr: number; position: number; expectedCtr?: number };
  rationale: string;
  targetUrl?: string;
  draftContent: DraftContent | null;
  /** Same-page variants folded into this opportunity. */
  relatedQueries?: Array<{ query: string; impressions: number; position: number }>;
  /** Other URLs on the site Google shows for the primary query. */
  competingPages?: PageShare[];
  /** new_article past the per-run cap: persisted with no draft. */
  deferred?: boolean;
};

export type OutcomeCheck = {
  id: number;
  query: string;
  type: OpportunityType;
  decidedAt: string;
  before: { impressions: number; clicks: number; position: number };
  /** null = no impressions in this run's window (confirmed by an exact lookup). */
  now: { impressions: number; clicks: number; position: number } | null;
  verdict: 'improved' | 'flat' | 'worse' | 'gone';
};

export type AgentRunSummary = {
  runId: string;
  weekIdentified: string;
  dryRun: boolean;
  gscRange: { start: string; end: string };
  counts: {
    rowsFromGsc: number;
    candidates: number;
    classified: number;
    metaRewrites: number;
    onPageTweaks: number;
    newArticles: number;
    deferred: number;
    heldBack: number;
  };
  /** Pending opportunities raised by this run (cluster leads only). */
  opportunities: Opportunity[];
  /** Queries that qualified but sit inside the cooldown. */
  heldBack: Array<{ query: string; type: OpportunityType; priorId: number }>;
  outcomes: OutcomeCheck[];
  spendUsd: number;
  errors: string[];
};

/** ISO-week label, e.g. "2026-W49". UTC, ISO 8601. */
export function isoWeekLabel(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Position-expected CTR benchmarks (industry aggregate), positions 1–5. */
const POSITION_CTR: Record<number, number> = { 1: 0.28, 2: 0.15, 3: 0.1, 4: 0.07, 5: 0.05 };

export function expectedCtrForPosition(position: number): number | undefined {
  return POSITION_CTR[Math.round(position)];
}
