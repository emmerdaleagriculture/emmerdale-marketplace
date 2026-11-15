/**
 * Triage: raw GSC (query, page) rows → one row per query → candidates.
 *
 * Cheap and deterministic, so it runs before any model call. Thresholds and
 * the grouping rule are HPM's, where each was learned the hard way (see the
 * comments in hpm-site src/app/api/seo-agent/lib/triage.ts).
 */

import type { GscRow } from '@/lib/gsc';
import { expectedCtrForPosition, type OpportunityType, type QueryRow } from './types';

export type TriageVerdict =
  | { candidate: false; reason: string }
  | { candidate: true; type: OpportunityType; reason: string };

/**
 * Impression floors, tuned to this site's volume, not HPM's. HPM uses 30;
 * here (Nov 2026: 281 queries a month, most of them long-tail county
 * searches) 30 left ONE candidate. 10 leaves ~40, and clustering folds the
 * long tail into a handful of drafts (nine "agricultural hedge cutting
 * <town> aberdeenshire" queries share one page). A CTR verdict needs more
 * data than a ranking one: at 10 impressions, zero clicks from position 3
 * is noise, so snippet rewrites wait for 20.
 */
export const MIN_IMPRESSIONS = 10;
export const MIN_IMPRESSIONS_META = 20;

export function triageRow(row: QueryRow): TriageVerdict {
  const { impressions, position, ctr } = row;
  if (impressions < MIN_IMPRESSIONS) return { candidate: false, reason: 'too few impressions' };

  // Meta rewrite: ranks on top, CTR well below what that position earns.
  if (position >= 1 && position <= 5) {
    if (impressions < MIN_IMPRESSIONS_META) return { candidate: false, reason: 'too few impressions to judge CTR' };
    const expected = expectedCtrForPosition(position);
    if (expected && ctr < expected * 0.7) {
      return { candidate: true, type: 'meta_rewrite', reason: `pos ${position.toFixed(1)}, CTR below benchmark` };
    }
  }
  // Striking distance: bottom of page 1 to bottom of page 2.
  if (position > 5 && position <= 20) {
    return { candidate: true, type: 'on_page_tweak', reason: `striking distance: pos ${position.toFixed(1)}` };
  }
  // Demand we barely rank for: a new article, if the intent allows.
  if (position > 20) {
    return { candidate: true, type: 'new_article', reason: `low rank: pos ${position.toFixed(1)}` };
  }
  return { candidate: false, reason: 'no trigger matched' };
}

/** Ranks new_article candidates for the per-run cap. */
export function articleScore(row: { impressions: number; position: number }): number {
  return row.impressions / Math.max(row.position, 1);
}

/** A secondary URL counts as competing at ≥10 impressions AND ≥20% of the primary's. */
const SPLIT_MIN_IMPRESSIONS = 10;
const SPLIT_MIN_SHARE = 0.2;

/**
 * Group (query, page) rows into one row per query, keeping the PRIMARY page:
 * the one with the most impressions, ties to the better position.
 *
 * Metrics are the primary row's as GSC reported them, never summed across
 * pages: summing drags ctr below benchmark with weak secondary pages and
 * flags healthy pages for rewrites. Secondary pages are kept only as a
 * signal (otherPages): a real share on a second URL means Google can't
 * decide which page owns the query, which no added copy fixes.
 */
export function groupByQuery(rows: GscRow[]): QueryRow[] {
  const primary = new Map<string, QueryRow>();
  const pages = new Map<string, Array<{ page: string; impressions: number; position: number }>>();
  for (const r of rows) {
    const query = r.keys?.[0];
    if (!query) continue;
    const page = r.keys?.[1];
    if (page) {
      const list = pages.get(query) ?? [];
      list.push({ page, impressions: r.impressions, position: r.position });
      pages.set(query, list);
    }
    const cur = primary.get(query);
    if (!cur || r.impressions > cur.impressions || (r.impressions === cur.impressions && r.position < cur.position)) {
      primary.set(query, { query, page, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    }
  }
  for (const row of primary.values()) {
    const others = (pages.get(row.query) ?? [])
      .filter((p) => p.page !== row.page)
      .filter((p) => p.impressions >= Math.max(SPLIT_MIN_IMPRESSIONS, row.impressions * SPLIT_MIN_SHARE))
      .sort((a, b) => b.impressions - a.impressions);
    if (others.length) row.otherPages = others;
  }
  return Array.from(primary.values());
}

/**
 * The brand. "emmerdale agriculture" is most of the site's clicks and lands
 * on the homepage by design; neither an H2 nor an article changes that, and
 * the sister business (Hampshire Paddock Management) has its own site.
 */
const BRAND = /\bemmerdale\b|\bhampshire paddock management\b/i;

export function isBrandQuery(query: string): boolean {
  return BRAND.test(query);
}
