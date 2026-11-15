/**
 * Did the changes we shipped move anything? Each completed opportunity
 * decided 6–26 weeks ago is compared with the same query in this run's GSC
 * pull. A query missing from the pull (capped at 1,000 rows) is looked up
 * alone before it is called gone.
 *
 * Position is the fair signal: clicks and impressions also move with the
 * season, and the "before" window is a different month. Recrawl lag on this
 * site runs to weeks, so anything under 6 weeks old isn't judged.
 */

import { gscQuery } from '@/lib/gsc';
import type { Db } from './persist';
import type { OpportunityType, OutcomeCheck, QueryRow } from './types';

const MIN_AGE_DAYS = 42;
const MAX_AGE_DAYS = 182;
const POSITION_DELTA = 2;

export function verdictFor(
  before: { clicks: number; position: number },
  now: { clicks: number; position: number } | null,
): OutcomeCheck['verdict'] {
  if (!now) return 'gone';
  const moved = before.position - now.position; // positive = ranks higher now
  if (before.position > 0 && moved >= POSITION_DELTA) return 'improved';
  if (before.position > 0 && moved <= -POSITION_DELTA) return 'worse';
  if (now.clicks >= before.clicks + 3 && now.clicks >= before.clicks * 1.5) return 'improved';
  return 'flat';
}

export async function reviewOutcomes(
  db: Db,
  grouped: QueryRow[],
  range: { start: string; end: string },
  now = Date.now(),
): Promise<OutcomeCheck[]> {
  const { data, error } = await db
    .from('seo_opportunities')
    .select('id, query, type, decided_at, impressions, clicks, position')
    .eq('status', 'completed')
    .gt('decided_at', new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString())
    .lt('decided_at', new Date(now - MIN_AGE_DAYS * 86_400_000).toISOString())
    .order('decided_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const current = new Map(grouped.map((r) => [r.query, r]));
  const seen = new Set<string>();
  const out: OutcomeCheck[] = [];
  for (const d of data ?? []) {
    if (seen.has(d.query)) continue; // latest decision per query
    seen.add(d.query);
    const before = { impressions: Number(d.impressions ?? 0), clicks: Number(d.clicks ?? 0), position: Number(d.position ?? 0) };
    const row = current.get(d.query);
    let nowM: OutcomeCheck['now'] = row ? { impressions: row.impressions, clicks: row.clicks, position: row.position } : null;
    if (!nowM) {
      try {
        const [r] = await gscQuery({
          startDate: range.start,
          endDate: range.end,
          dimensions: ['query'],
          filters: [{ dimension: 'query', expression: d.query }],
          rowLimit: 1,
        });
        if (r && r.impressions > 0) nowM = { impressions: r.impressions, clicks: r.clicks, position: r.position };
      } catch {
        continue; // can't tell flat from gone: leave it out rather than guess
      }
    }
    out.push({
      id: d.id,
      query: d.query,
      type: d.type as OpportunityType,
      decidedAt: String(d.decided_at),
      before,
      now: nowM,
      verdict: verdictFor(before, nowM),
    });
  }
  const order = { worse: 0, gone: 1, flat: 2, improved: 3 } as const;
  return out.sort((a, b) => order[a.verdict] - order[b.verdict]);
}
