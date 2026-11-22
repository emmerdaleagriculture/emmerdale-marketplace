import { unstable_cache } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Insight › A/B tests: every split test's results in one place, read through
 * a one-hour cache. Both summaries scan a month of rows and nothing here needs
 * to be to-the-minute; the Refresh button (actions.ts) drops the cache when it
 * does. A test that fails to load throws, so a failure is never cached.
 */
export const AB_TESTS_TAG = 'ab-tests';

export type MarkupArm = {
  rate: number;
  jobs: number;
  priced: number;
  prices: number;
  passes: number;
  passes_price: number;
  booked: number;
  completed: number;
  cancelled: number;
  lapsed: number;
  avg_client_pence: number | null;
  avg_contractor_pence: number | null;
  margin_pence: number;
  median_days_to_book: number | null;
  since: string | null;
};

export type MarkupTest = {
  enabled: boolean;
  rates: Partial<Record<'a' | 'b', number>>;
  arms: Partial<Record<'a' | 'b', MarkupArm>>;
  since: string | null;
  /** Every pass in 30 days, all jobs, by reason. */
  passes_30d: Record<string, number>;
};


/** An arm with no jobs yet, so the table shows both columns from day one. */
export function emptyArm(rate: number): MarkupArm {
  return { rate, jobs: 0, priced: 0, prices: 0, passes: 0, passes_price: 0, booked: 0, completed: 0, cancelled: 0, lapsed: 0, avg_client_pence: null, avg_contractor_pence: null, margin_pence: 0, median_days_to_book: null, since: null };
}


/**
 * Two-sided p-value for "the two arms book priced jobs at the same rate"
 * (pooled two-proportion z-test). Null until both arms have something to
 * compare. Small samples make this generous rather than strict; it is a
 * reading aid, not a verdict.
 */
export function bookingRatePValue(a: MarkupArm, b: MarkupArm): number | null {
  if (a.priced < 5 || b.priced < 5) return null;
  return twoProportionPValue(a.booked, a.priced, b.booked, b.priced);
}

/** The same test on any two proportions x1/n1 against x2/n2. */
export function twoProportionPValue(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 === 0 || n2 === 0) return null;
  const p1 = x1 / n1, p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = Math.abs(p1 - p2) / se;
  // Φ(z) via the Abramowitz–Stegun erf approximation.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return Math.max(0, Math.min(1, 1 - erf));
}


export type HomeArm = {
  visits: number; saw_form: number; started: number; sent: number; median_depth: number | null;
  ad_visits: number; ad_saw_form: number; ad_started: number; ad_sent: number;
};
export type HomeSplit = { days: number; since: string | null; arms: { a?: HomeArm; b?: HomeArm } };



/** One test's figures and when they were read from the database (ISO). */
export type Cached<T> = { at: string; data: T | null };

export const HOME_SPLIT_DAYS = 30;

// One cache per test, so one that fails to load (and throws, so the failure
// is not cached) leaves the others on the page.
const CACHE = { revalidate: 3600, tags: [AB_TESTS_TAG] };

/** The commission split test (20261002100000): the two arms side by side. */
export const getMarkupTest = unstable_cache(
  async (): Promise<Cached<MarkupTest>> => {
    const { data, error } = await createServiceRoleClient().rpc('admin_markup_test_summary');
    if (error) throw new Error(`admin_markup_test_summary: ${error.message}`);
    return { at: new Date().toISOString(), data: (data ?? null) as MarkupTest | null };
  },
  ['ab-tests-markup-v1'],
  CACHE,
);

/** Home hero split test, phones (20261122140000, src/lib/homeSplit.ts). */
export const getHomeSplit = unstable_cache(
  async (): Promise<Cached<HomeSplit>> => {
    const { data, error } = await createServiceRoleClient().rpc('admin_home_split_summary', { p_days: HOME_SPLIT_DAYS });
    if (error) throw new Error(`admin_home_split_summary: ${error.message}`);
    return { at: new Date().toISOString(), data: (data ?? null) as HomeSplit | null };
  },
  ['ab-tests-home-v1'],
  CACHE,
);
