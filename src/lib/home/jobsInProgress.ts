import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { memoize } from '@/lib/memo';

/**
 * Short on purpose. A new job triggers revalidatePath('/'), and a memo that
 * outlived that would rebuild the page from a stale read and show nothing
 * new — the point of the strip is that it moves.
 */
const LIVE_TTL_MS = 60_000;

/**
 * The work actually under way, for the homepage strip.
 *
 * Reads the `jobs_in_progress` view, which is deliberately coarse: county, an
 * approximate size and the date it came in. There is no service name — job
 * creation has run deterministic-only since 8e86e71, so `service_id` is null on
 * every live job — and no postcode, free text or contact detail reaches the
 * view at all.
 *
 * These are live jobs: sent to contractors and not yet finished, dead or
 * withdrawn. Drafts are excluded, and so is anything expired or cancelled —
 * the previous version of this strip counted both and had to say so in the
 * copy. Any copy around this must stay true to the WHERE clause.
 */

export type JobInProgress = {
  county: string;
  /** "24 acres", "200m", or null when nothing was extracted. */
  size_label: string | null;
  /** ISO date (no time of day). */
  created_on: string;
};

/**
 * Below this, the section hides entirely rather than advertising that almost
 * nobody has used us. Never pad, never invent, never sample.
 */
export const MIN_JOBS = 4;

/** How many the strip shows at most. */
const LIMIT = 8;

/**
 * The anon key is enough: the view grants SELECT to `anon` and reads its
 * RLS-protected source tables as its owner. Cookie-less, so the homepage stays
 * ISR-cacheable rather than being forced dynamic.
 *
 * Untyped client on purpose — `jobs_in_progress` is absent from
 * `database.types.ts` until the migration is applied and `supabase gen types`
 * is re-run. Swap this for `createStaticClient()` and drop the row cast once
 * that happens; nothing else here changes.
 */
function viewClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const getJobsInProgress = memoize<JobInProgress[]>(async () => {
  const { data, error } = await viewClient()
    .from('jobs_in_progress')
    .select('county, size_label, created_on')
    .order('ord', { ascending: true })
    .limit(LIMIT);

  if (error) {
    // A missing view (migration not yet pushed) must not take the homepage
    // down — the section simply doesn't render.
    console.error('[jobsInProgress] read failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as { county: unknown; size_label: unknown; created_on: unknown }[];
  return rows.flatMap((r) =>
    typeof r.county === 'string' && typeof r.created_on === 'string'
      ? [
          {
            county: r.county,
            size_label: typeof r.size_label === 'string' ? r.size_label : null,
            created_on: r.created_on,
          },
        ]
      : [],
  );
}, LIVE_TTL_MS);

/** "13 September 2026" — the date it came in, as Tom asked. */
export function formatJobDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
