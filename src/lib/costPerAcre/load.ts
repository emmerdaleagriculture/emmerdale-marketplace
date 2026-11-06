import { createServiceRoleClient } from '@/lib/supabase/server';
import { memoize, REFERENCE_TTL_MS } from '@/lib/memo';
import { EMPTY_SNAPSHOT, type CostSnapshot, type Rate, type RateScope } from './model';

/**
 * The cost-per-acre snapshot, read once per ten minutes. The table has no
 * read policy (the page is the only reader), so this needs the service role,
 * but stays cookie-less so the page can be statically rendered and
 * revalidated like the county pages. The snapshot is small (one row per
 * service per place with a figure), far under the API's 1000-row cap.
 */
export const getCostSnapshot = memoize<CostSnapshot>(async () => {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('cost_per_acre')
    .select(
      'scope, region, county, service_id, service, jobs, quotes, acres, avg_per_acre_pence, median_per_acre_pence, low_per_acre_pence, high_per_acre_pence, since, computed_at',
    );
  if (error) throw new Error(`[cost-per-acre] ${error.message}`);
  if (!data || data.length === 0) return EMPTY_SNAPSHOT;

  const rows: Rate[] = data.map((r) => ({
    scope: r.scope as RateScope,
    region: r.region,
    county: r.county,
    serviceId: r.service_id,
    service: r.service,
    jobs: r.jobs,
    quotes: r.quotes,
    acres: Number(r.acres),
    avg: r.avg_per_acre_pence,
    median: r.median_per_acre_pence,
    low: r.low_per_acre_pence,
    high: r.high_per_acre_pence,
  }));
  // Every row in a snapshot shares computed_at; the oldest job is the
  // earliest `since` across the UK rows.
  const since = data.map((r) => r.since).sort()[0] ?? null;
  return {
    computedAt: data[0].computed_at,
    since,
    uk: rows.filter((r) => r.scope === 'uk'),
    regions: rows.filter((r) => r.scope === 'region'),
    counties: rows.filter((r) => r.scope === 'county'),
  };
}, REFERENCE_TTL_MS);
