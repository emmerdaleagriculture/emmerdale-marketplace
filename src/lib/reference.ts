import { createClient } from '@/lib/supabase/server';
import type { CountyOption } from '@/components/forms/CountyPicker';
import type { ServiceOption } from '@/components/forms/ServicePicker';

/**
 * Reference data for signup/account forms. Readable by anon + authenticated
 * (RLS policies counties_read / services_read), so these work pre-login.
 */
export async function getCounties(): Promise<CountyOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('counties')
    .select('id, name, region')
    .order('id');
  return data ?? [];
}

export async function getServices(): Promise<ServiceOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('services').select('id, name').order('id');
  return data ?? [];
}
