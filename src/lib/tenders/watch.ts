/**
 * Tender watch — fetch, score, dedupe, place and upsert into `tenders`.
 *
 * One national pool. The watcher owns every column of a `tenders` row; what
 * an Open member does with one (interested, bidding, not for me, notes) lives
 * in `contractor_tenders`, which the watcher never touches. Each member's
 * list is the pool cut to their patch by sq_tenders_for().
 *
 * Ported from HPM's single-site watcher (hpm-site dde829a). Differences:
 * no Winchester radius (place is stored, not filtered), no seeded
 * subcontract leads (those were HPM's own), and renewals come from a daily
 * fortnight of award notices plus a one-off five-year backfill instead of a
 * five-year sweep every Monday.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type TenderUpdate = Database['public']['Tables']['tenders']['Update'];
import { resolveCounty } from '@/lib/postcodes';
import { addMonths, contractKey, MIN_SCORE, RENEWAL_LEAD_MONTHS, scoreRelevance, type Fit } from './match';
import {
  fetchContractsFinderAwards,
  fetchContractsFinderOpen,
  fetchFindATender,
  type RawNotice,
} from './sources';

export type TenderKind = 'open' | 'pipeline' | 'renewal';

export interface Candidate {
  sourceKey: string;
  kind: TenderKind;
  fit: Fit;
  title: string;
  buyer: string;
  description: string;
  url: string;
  source: RawNotice['source'];
  noticeId: string;
  publishedAt: string | null;
  deadline: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  actionBy: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  incumbent: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  cpv: string;
  matched: string;
  score: number;
}

export interface WatchSummary {
  dryRun: boolean;
  fetched: { contractsFinderOpen: number; contractsFinderAwards: number; findATender: number };
  kept: Record<TenderKind, number>;
  /** Scored, but with no postcode or coordinates — no member's patch can contain them. */
  unplaced: number;
  created: number;
  changedKind: number;
  refreshed: number;
  /** A sample of what was created, for the manual run's report. */
  sample: Pick<Candidate, 'kind' | 'fit' | 'title' | 'buyer' | 'actionBy' | 'postcode' | 'url'>[];
  errors: string[];
}

/** ISO string, or null for anything Date can't read (CF has sent "0001-01-01"). */
function iso(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  if (!Number.isFinite(t) || t < Date.UTC(1990, 0, 1)) return null;
  return new Date(t).toISOString();
}

export function toCandidate(n: RawNotice, now: Date): Candidate | null {
  const rel = scoreRelevance(n.title, n.description, n.cpvCodes);
  if (rel.score < MIN_SCORE) return null;

  const deadline = iso(n.deadline);
  const contractEnd = iso(n.contractEnd);
  let kind: TenderKind;
  let actionBy: string | null;
  if (n.stage === 'award') {
    // Only contracts still running are worth tracking for renewal.
    if (!contractEnd || new Date(contractEnd) < now) return null;
    kind = 'renewal';
    actionBy = addMonths(new Date(contractEnd), -RENEWAL_LEAD_MONTHS).toISOString();
  } else {
    // Contracts Finder keeps some "Open" notices whose deadline has passed.
    if (deadline && new Date(deadline) < now) return null;
    kind = n.stage;
    actionBy = deadline;
  }

  return {
    sourceKey: contractKey(n.buyer, n.title),
    kind,
    fit: rel.fit,
    title: n.title.slice(0, 300),
    buyer: n.buyer.slice(0, 300),
    description: n.description.slice(0, 4000),
    url: n.url,
    source: n.source,
    noticeId: n.noticeId,
    publishedAt: iso(n.publishedAt),
    deadline,
    contractStart: iso(n.contractStart),
    contractEnd,
    actionBy,
    valueLow: n.valueLow,
    valueHigh: n.valueHigh,
    incumbent: n.supplier,
    postcode: n.postcode,
    lat: n.lat,
    lng: n.lng,
    cpv: n.cpvCodes.join(' ').slice(0, 300),
    matched: rel.matched.join(', ').slice(0, 500),
    score: rel.score,
  };
}

/**
 * Merge candidates that describe the same contract (tender + closed +
 * award notices). Prefer open over renewal (live beats historical), then
 * whichever has a supplier, then the most recently published.
 */
export function dedupe(cands: Candidate[]): Candidate[] {
  const rank = (c: Candidate) =>
    (c.kind === 'open' ? 4 : c.kind === 'pipeline' ? 3 : 0) + (c.incumbent ? 1 : 0);
  const best = new Map<string, Candidate>();
  for (const c of cands) {
    const prev = best.get(c.sourceKey);
    if (
      !prev ||
      rank(c) > rank(prev) ||
      (rank(c) === rank(prev) && (c.publishedAt ?? '') > (prev.publishedAt ?? ''))
    ) {
      best.set(c.sourceKey, {
        ...c,
        incumbent: c.incumbent ?? prev?.incumbent ?? null,
        lat: c.lat ?? prev?.lat ?? null,
        lng: c.lng ?? prev?.lng ?? null,
        postcode: c.postcode ?? prev?.postcode ?? null,
      });
    }
  }
  return [...best.values()];
}

type Existing = { id: string; kind: TenderKind; published_at: string | null; county_id: number | null; lat: number | null };

const live = (k: TenderKind) => k === 'open' || k === 'pipeline';

/**
 * What to write onto an existing row for a freshly-seen candidate, or null.
 *
 * Rows are keyed on buyer + title, and parishes reuse titles every term
 * ("Grounds Maintenance Contract"), so one row tracks a contract across
 * re-lets:  renewal → open (re-tendered) → renewal (awarded) → …
 *
 *  - A candidate published BEFORE what the row holds is stale (the previous
 *    term's award notice, re-seen by a backfill while the new tender is
 *    live) — ignored, so the row can't flap back.
 *  - renewal → open/pipeline stamps live_since, which is what makes the row
 *    "new" again for every member who had already seen it as a renewal.
 *  - Factual fields only overwrite with non-empty values.
 */
export function transition(
  doc: Pick<Existing, 'kind' | 'published_at'>,
  c: Candidate,
  nowIso: string,
): TenderUpdate | null {
  const t = (d?: string | null) => (d ? Date.parse(d) : NaN);
  if (t(c.publishedAt) < t(doc.published_at)) return null;

  const factual: Record<string, unknown> = {
    title: c.title,
    buyer: c.buyer,
    url: c.url,
    notice_id: c.noticeId,
    source: c.source,
    description: c.description,
    deadline: c.deadline,
    contract_start: c.contractStart,
    contract_end: c.contractEnd,
    value_low: c.valueLow,
    value_high: c.valueHigh,
    incumbent: c.incumbent,
    cpv: c.cpv,
    matched: c.matched,
    score: c.score,
    fit: c.fit,
    published_at: c.publishedAt,
  };
  const data = Object.fromEntries(
    Object.entries(factual).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  ) as TenderUpdate;
  data.last_seen_at = nowIso;
  if (c.kind !== doc.kind) {
    data.kind = c.kind;
    if (!live(doc.kind) && live(c.kind)) data.live_since = nowIso;
  }
  data.action_by = c.actionBy;
  return data;
}

export interface WatchOptions {
  dryRun?: boolean;
  /** How far back to page Find a Tender. Default 3 days (daily cron + overlap for flaky days). */
  findATenderSince?: Date;
  /** Award notices published since this date feed renewals. Default 14 days ago. */
  awardsSince?: Date;
  /** Per-source time budgets; the backfill script lifts them. */
  budgetMs?: { open?: number; awards?: number; findATender?: number };
}

type Place = { county_id: number | null; lat: number | null; lng: number | null };

/** Postcode → county + centroid, once per postcode per run. */
function placer() {
  const cache = new Map<string, Promise<Place>>();
  return (postcode: string | null, lat: number | null, lng: number | null): Promise<Place> => {
    if (!postcode) return Promise.resolve({ county_id: null, lat, lng });
    const key = postcode.toUpperCase().replace(/\s+/g, '');
    let p = cache.get(key);
    if (!p) {
      p = resolveCounty(postcode)
        .then((r) => ({ county_id: r.ok ? r.county_id ?? null : null, lat: r.lat ?? null, lng: r.lng ?? null }))
        .catch(() => ({ county_id: null, lat: null, lng: null }));
      cache.set(key, p);
    }
    // The notice's own coordinates are the site; the postcode's are the buyer's office.
    return p.then((r) => ({ county_id: r.county_id, lat: lat ?? r.lat, lng: lng ?? r.lng }));
  };
}

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

export async function runTenderWatch(
  admin: SupabaseClient<Database>,
  opts: WatchOptions = {},
): Promise<WatchSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const errors: string[] = [];
  const ftsSince = opts.findATenderSince ?? new Date(now.getTime() - 3 * 86_400_000);
  const awardsSince = opts.awardsSince ?? new Date(now.getTime() - 14 * 86_400_000);
  const b = opts.budgetMs ?? {};

  const [cfOpen, cfAwards, fts] = await Promise.all([
    fetchContractsFinderOpen(errors, b.open ?? 110_000),
    fetchContractsFinderAwards(errors, awardsSince, now, b.awards ?? 110_000),
    fetchFindATender(ftsSince, errors, b.findATender ?? 150_000),
  ]);

  const scored = dedupe(
    [...cfOpen, ...cfAwards, ...fts].map((n) => toCandidate(n, now)).filter((c): c is Candidate => c !== null),
  );
  const candidates = scored.filter((c) => c.postcode || (c.lat != null && c.lng != null));

  const summary: WatchSummary = {
    dryRun: Boolean(opts.dryRun),
    fetched: { contractsFinderOpen: cfOpen.length, contractsFinderAwards: cfAwards.length, findATender: fts.length },
    kept: { open: 0, pipeline: 0, renewal: 0 },
    unplaced: scored.length - candidates.length,
    created: 0,
    changedKind: 0,
    refreshed: 0,
    sample: [],
    errors,
  };
  for (const c of candidates) summary.kept[c.kind]++;

  // Existing rows, in chunks (an .in() list of hundreds of keys is a long URL).
  const byKey = new Map<string, Existing>();
  const keys = candidates.map((c) => c.sourceKey);
  for (let i = 0; i < keys.length; i += 150) {
    const { data, error } = await admin
      .from('tenders')
      .select('id, source_key, kind, published_at, county_id, lat')
      .in('source_key', keys.slice(i, i + 150));
    if (error) throw new Error(`reading tenders: ${error.message}`);
    for (const d of data ?? []) byKey.set(d.source_key, d as Existing & { source_key: string });
  }

  const place = placer();
  await mapLimit(candidates, 6, async (c) => {
    const doc = byKey.get(c.sourceKey);
    try {
      if (!doc) {
        summary.created++;
        if (summary.sample.length < 40) {
          summary.sample.push({
            kind: c.kind, fit: c.fit, title: c.title, buyer: c.buyer,
            actionBy: c.actionBy?.slice(0, 10) ?? null, postcode: c.postcode, url: c.url,
          });
        }
        if (opts.dryRun) return;
        const p = await place(c.postcode, c.lat, c.lng);
        const { error } = await admin.from('tenders').insert({
          source_key: c.sourceKey,
          source: c.source,
          notice_id: c.noticeId,
          kind: c.kind,
          fit: c.fit,
          title: c.title,
          buyer: c.buyer,
          description: c.description,
          url: c.url,
          published_at: c.publishedAt,
          deadline: c.deadline,
          contract_start: c.contractStart,
          contract_end: c.contractEnd,
          action_by: c.actionBy,
          value_low: c.valueLow,
          value_high: c.valueHigh,
          incumbent: c.incumbent,
          postcode: c.postcode,
          county_id: p.county_id,
          lat: p.lat,
          lng: p.lng,
          cpv: c.cpv,
          matched: c.matched,
          score: c.score,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          live_since: live(c.kind) ? nowIso : null,
        });
        // A concurrent run inserted it first: harmless.
        if (error && error.code !== '23505') throw new Error(error.message);
        return;
      }
      const data = transition(doc, c, nowIso);
      if (!data) return;
      if (data.kind) summary.changedKind++;
      else summary.refreshed++;
      if (opts.dryRun) return;
      // Rows placed before the postcode lookup worked get another go.
      if (doc.county_id == null && doc.lat == null) {
        const p = await place(c.postcode, c.lat, c.lng);
        Object.assign(data, p);
      }
      const { error } = await admin.from('tenders').update(data).eq('id', doc.id);
      if (error) throw new Error(error.message);
    } catch (e) {
      errors.push(`upsert "${c.title}": ${(e as Error).message}`);
    }
  });

  return summary;
}
