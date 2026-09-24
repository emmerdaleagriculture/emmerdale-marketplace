import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
};

/**
 * Below this the board hides entirely. A board with two jobs on it advertises
 * that almost nobody has used us — worse than showing nothing. Never pad,
 * never invent, never sample.
 */
export const MIN_RECENT_WORK = 4;

/** The homepage board shows at most this many. */
const LIMIT = 8;

/**
 * Anon key: the view grants SELECT to `anon` and reads its RLS-protected
 * sources as its owner. Cookie-less, so the homepage stays ISR-cacheable.
 *
 * Untyped on purpose — `recent_work` is absent from `database.types.ts` until
 * the migration is applied and `supabase gen types` re-run. Swap for
 * `createStaticClient()` and drop the cast once that happens.
 */
function viewClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Short, like the jobs-in-progress strip: an award calls revalidatePath('/'),
 * and a memo that outlived it would rebuild the page from a stale read.
 */
const LIVE_TTL_MS = 60_000;

export const getRecentWork = memoize<RecentWorkRow[]>(async () => {
  const { data, error } = await viewClient()
    .from('recent_work')
    .select('service_name, amount_pence, stars, source')
    .order('ord', { ascending: true })
    .limit(LIMIT);

  if (error) {
    // A missing view (migration not pushed yet) must not take the homepage
    // down — the board simply doesn't render.
    console.error('[recentWork] read failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as {
    service_name: unknown;
    amount_pence: unknown;
    stars: unknown;
    source: unknown;
  }[];

  return rows.flatMap((r) =>
    typeof r.service_name === 'string' && typeof r.amount_pence === 'number'
      ? [
          {
            service_name: r.service_name,
            amount_pence: r.amount_pence,
            stars: typeof r.stars === 'number' ? r.stars : null,
            source: r.source === 'hpm' ? ('hpm' as const) : ('emmerdale' as const),
          },
        ]
      : [],
  );
}, LIVE_TTL_MS);

/**
 * The services actually present in the rows, in board order.
 *
 * Deliberately derived from the data rather than from HOME_SERVICES: the two
 * taxonomies don't line up (the services table has `Flailing`, which has no
 * card at all, and cards merge rows the table keeps apart), so chips built from the card list
 * would silently hide real jobs.
 */
export function serviceFilters(rows: RecentWorkRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) if (!seen.includes(r.service_name)) seen.push(r.service_name);
  return seen;
}
