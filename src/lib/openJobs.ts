import { createServiceRoleClient } from '@/lib/supabase/server';
import { jobAcres } from '@/lib/jobParse/geometry';

/**
 * Jobs out with contractors right now, by county, for the public contractor
 * landing page — the proof that there is work to be had.
 *
 * Deliberately thin. A job is shown as its service and rough size and
 * nothing else: no postcode, no customer wording (people write their village,
 * their neighbour's business and their access lane into the description), no
 * dates. A customer who asked for a quote did not ask to be advertised.
 *
 * Needs the service role (submissions are not world-readable) but stays
 * cookie-less, so the ISR page that calls it stays static.
 */

export type OpenJob = { service: string; size: string | null };
export type CountyJobs = { county: string; jobs: OpenJob[] };

/** Out with contractors and still taking prices. */
const OPEN = ['distributed', 'quotes_receiving'];

const HECTARE_IN_ACRES = 2.47105;

/**
 * "7.8 acres", or null when the figure would mislead. Only areas are shown:
 * linear metres and unit-less numbers on this table are too often a stray
 * parse to print on a public page.
 */
export function sizeLabel(value: number | null, unit: string | null): string | null {
  if (value == null || !(value > 0)) return null;
  const acres = unit === 'acres' ? value : unit === 'hectares' ? value * HECTARE_IN_ACRES : null;
  if (acres == null || acres < 0.1) return null;
  if (acres < 1) return 'under an acre';
  const rounded = acres < 10 ? Math.round(acres * 10) / 10 : Math.round(acres);
  return `${rounded} acre${rounded === 1 ? '' : 's'}`;
}

type Row = {
  area_value: number | null;
  area_unit: string | null;
  area_mapped_value: number | null;
  area_source: string | null;
  counties: { name: string } | null;
  services: { name: string } | null;
};

export async function getOpenJobsByCounty(): Promise<CountyJobs[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('job_submissions')
    .select('area_value, area_unit, area_mapped_value, area_source, counties(name), services(name)')
    .in('status', OPEN)
    .is('hidden_at', null)
    .gt('expires_at', new Date().toISOString())
    .not('county_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[openJobs] could not load:', error.message);
    return [];
  }

  const byCounty = new Map<string, OpenJob[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const county = r.counties?.name;
    if (!county) continue;
    const job: OpenJob = {
      // Unclassified jobs carry only the customer's own words, which is
      // exactly what this page must not print.
      service: r.services?.name ?? 'Other land work',
      size:
        jobAcres(r) !== null && r.area_unit !== 'linear_m'
          ? sizeLabel(jobAcres(r), 'acres')
          : sizeLabel(r.area_value, r.area_unit),
    };
    const list = byCounty.get(county);
    if (list) list.push(job);
    else byCounty.set(county, [job]);
  }

  // Busiest county first, then alphabetical.
  return [...byCounty]
    .map(([county, jobs]) => ({ county, jobs }))
    .sort((a, b) => b.jobs.length - a.jobs.length || a.county.localeCompare(b.county));
}
