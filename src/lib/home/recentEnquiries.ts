import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { memoize, REFERENCE_TTL_MS } from '@/lib/memo';

/**
 * What's coming in, for the homepage strip.
 *
 * Reads the `recent_enquiries` view, which is deliberately coarse: county, an
 * approximate size and the date it arrived. There is no service name — job
 * creation has run deterministic-only since 8e86e71, so `service_id` is null on
 * almost every submission by design — and no postcode, free text or contact
 * detail reaches the view at all.
 *
 * These are ENQUIRIES, not bookings: most never reached a quote, and drafts are
 * included on purpose. Any copy around this must say so.
 */

export type RecentEnquiry = {
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
export const MIN_ENQUIRIES = 4;

/** How many the strip shows at most. */
const LIMIT = 8;

/**
 * The anon key is enough: the view grants SELECT to `anon` and reads its
 * RLS-protected source tables as its owner. Cookie-less, so the homepage stays
 * ISR-cacheable rather than being forced dynamic.
 *
 * Untyped client on purpose — `recent_enquiries` is absent from
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

export const getRecentEnquiries = memoize<RecentEnquiry[]>(async () => {
  const { data, error } = await viewClient()
    .from('recent_enquiries')
    .select('county, size_label, created_on')
    .order('ord', { ascending: true })
    .limit(LIMIT);

  if (error) {
    // A missing view (migration not yet pushed) must not take the homepage
    // down — the section simply doesn't render.
    console.error('[recentEnquiries] read failed:', error.message);
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
}, REFERENCE_TTL_MS);

/** "13 September 2026" — the date it came in, as Tom asked. */
export function formatEnquiryDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
