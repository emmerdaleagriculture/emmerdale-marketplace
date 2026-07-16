import { createStaticClient } from '@/lib/supabase/static';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { CountyOption } from '@/components/forms/CountyPicker';
import type { ServiceOption } from '@/components/forms/ServicePicker';

/**
 * Reference data for public pages and forms. Uses the cookie-less client so
 * callers can be statically rendered / ISR-cached — counties and services are
 * world-readable (RLS policies counties_read / services_read) and effectively
 * fixed taxonomy, so no per-request fetch is warranted.
 */
export async function getCounties(): Promise<CountyOption[]> {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from('counties')
    .select('id, name, region')
    .order('id');
  return data ?? [];
}

export async function getServices(): Promise<ServiceOption[]> {
  const supabase = createStaticClient();
  const { data } = await supabase.from('services').select('id, name').order('id');
  return data ?? [];
}

/**
 * Approved-contractor count per county name, for the coverage map. Needs the
 * service role (contractor rows aren't world-readable) but stays cookie-less,
 * so ISR pages can call it without becoming dynamic.
 */
export async function getCountyCoverage(): Promise<Record<string, number>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('contractor_counties')
    .select('counties(name), contractors!inner(status)')
    .eq('contractors.status', 'approved');

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const name = (row.counties as unknown as { name: string } | null)?.name;
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}
