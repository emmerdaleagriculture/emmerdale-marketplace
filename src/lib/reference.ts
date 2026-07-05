import { createStaticClient } from '@/lib/supabase/static';
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
