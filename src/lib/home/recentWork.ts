import { createStaticClient } from '@/lib/supabase/static';
import { memoize } from '@/lib/memo';

/**
 * Booked work, with what it actually cost — every job from its award on.
 *
 * This is what replaced published guide prices. A price list promises a figure
 * for the next job and cannot survive the variance in this trade; a finished
 * job at £270 commits us to nothing, so nobody can be ambushed by it, while
 * still answering the only question a visitor really has.
 *
 * Reads the `recent_work` view, which prices each job from the accepted client
 * quote rather than from `job_payments` — under the 15% deposit model a
 * completed job has two paid rows, so that table would report every job twice
 * at two wrong figures. See the migration for the full reasoning.
 */

export type RecentWorkRow = {
  service_name: string;
  amount_pence: number;
  /** Null on an unrated job. NEVER substitute a default — that is a fake review. */
  stars: number | null;
  source: 'emmerdale' | 'hpm';
  /** The county, or null on a seeded row. */
  county: string | null;
  /** The job's size as a band: "3–10 acres", "100–300 m". Null when unknown. */
  size: string | null;
};

const HECTARE_IN_ACRES = 2.471;
const SQ_M_IN_ACRES = 1 / 4046.86;

/**
 * The size as the card prints it: a band, not a figure. The jobs-in-progress
 * strip on the same page publishes county, a size to one decimal and a date
 * for live jobs; a figure here would let the two be matched row for row and
 * put a price and a rating against a dated, holding-sized job. A band plus
 * a county matches loosely enough to name nothing, and still tells a visitor
 * whether a job is like theirs. Acres only for work priced by area — a hedge
 * mapped round a paddock is not a two-acre hedge; a length prints regardless.
 */
export function sizeBand(job: {
  area_value: number | null;
  area_unit: string | null;
  area_mapped_value: number | null;
  area_priced: boolean;
}): string | null {
  if (job.area_unit === 'linear_m') {
    const m = job.area_value;
    if (m == null || !(m > 0)) return null;
    return m < 100 ? 'under 100 m' : m < 300 ? '100–300 m' : m < 1000 ? '300–1,000 m' : 'over 1,000 m';
  }
  if (!job.area_priced) return null;
  const stated =
    job.area_value == null
      ? null
      : job.area_unit === 'acres'
        ? job.area_value
        : job.area_unit === 'hectares'
          ? job.area_value * HECTARE_IN_ACRES
          : job.area_unit === 'sq_m'
            ? job.area_value * SQ_M_IN_ACRES
            : null;
  const acres = job.area_mapped_value ?? stated;
  if (acres == null || !(acres > 0)) return null;
  return acres < 1 ? 'under an acre' : acres < 3 ? '1–3 acres' : acres < 10 ? '3–10 acres' : acres < 30 ? '10–30 acres' : 'over 30 acres';
}

/**
 * Below this the board hides entirely. A board with two jobs on it advertises
 * that almost nobody has used us — worse than showing nothing. Never pad,
 * never invent, never sample.
 */
export const MIN_RECENT_WORK = 4;

/** The homepage board shows at most this many. */
const LIMIT = 8;

/**
 * Short, like the jobs-in-progress strip: an award calls revalidatePath('/'),
 * and a memo that outlived it would rebuild the page from a stale read.
 */
const LIVE_TTL_MS = 60_000;

export const getRecentWork = memoize<RecentWorkRow[]>(async () => {
  // Anon key: the view grants SELECT to `anon` and reads its RLS-protected
  // sources as its owner. Cookie-less, so the homepage stays ISR-cacheable.
  const { data, error } = await createStaticClient()
    .from('recent_work')
    .select('service_name, amount_pence, stars, source, county, area_value, area_unit, area_mapped_value, area_priced')
    .order('ord', { ascending: true })
    .limit(LIMIT);

  if (error) {
    // A missing view (migration not pushed yet) must not take the homepage
    // down — the board simply doesn't render.
    console.error('[recentWork] read failed:', error.message);
    return [];
  }

  return (data ?? []).flatMap((r) =>
    r.service_name && r.amount_pence != null
      ? [
          {
            service_name: r.service_name,
            amount_pence: r.amount_pence,
            stars: r.stars,
            source: r.source === 'hpm' ? ('hpm' as const) : ('emmerdale' as const),
            county: r.county,
            size: sizeBand({
              area_value: r.area_value,
              area_unit: r.area_unit,
              area_mapped_value: r.area_mapped_value,
              area_priced: r.area_priced !== false,
            }),
          },
        ]
      : [],
  );
}, LIVE_TTL_MS);

/**
 * The services actually present in the rows, in board order.
 *
 * Deliberately derived from the data rather than from HOME_SERVICES: the two
 * taxonomies don't line up (cards merge rows the table keeps apart, and a
 * card name need not be a service name), so chips built from the card list
 * would silently hide real jobs.
 */
export function serviceFilters(rows: RecentWorkRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) if (!seen.includes(r.service_name)) seen.push(r.service_name);
  return seen;
}
