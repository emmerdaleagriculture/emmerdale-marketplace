import { createStaticClient } from '@/lib/supabase/static';
import { memoize, REFERENCE_TTL_MS } from '@/lib/memo';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CountyOption } from '@/components/forms/CountyPicker';
import type { ServiceOption } from '@/components/forms/ServicePicker';

/**
 * Reference data for public pages and forms. Uses the cookie-less client so
 * callers can be statically rendered / ISR-cached — counties and services are
 * world-readable (RLS policies counties_read / services_read) and effectively
 * fixed taxonomy, so no per-request fetch is warranted.
 */
export const getCounties = memoize<CountyOption[]>(async () => {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from('counties')
    .select('id, name, region, covers')
    .order('id');
  return data ?? [];
}, REFERENCE_TTL_MS);

export const getServices = memoize<ServiceOption[]>(async () => {
  const supabase = createStaticClient();
  const { data } = await supabase.from('services').select('id, name, listed').order('id');
  return data ?? [];
}, REFERENCE_TTL_MS);

/**
 * Approved-contractor count per county name, for the coverage map. Needs the
 * service role (contractor rows aren't world-readable) but stays cookie-less,
 * so ISR pages can call it without becoming dynamic.
 */
export async function getCountyCoverage(): Promise<Record<string, number>> {
  const supabase = createServiceRoleClient();
  // Counted in SQL (county_coverage view). This used to pull every
  // contractor-county row and count in here; the API caps a response at 1000
  // rows, the table passed that, and 85 counties quietly lost contractors.
  const { data } = await supabase.from('county_coverage').select('name, contractors');

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.name && row.contractors) counts[row.name] = row.contractors;
  }
  return counts;
}
