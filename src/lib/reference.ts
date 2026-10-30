import { unstable_cache } from 'next/cache';
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

/** The tag revalidateDirectory() clears: the directory and both coverage counts. */
export const COUNTY_DIRECTORY_TAG = 'county-directory';

/**
 * Approved-contractor count per county name, for the coverage map. Needs the
 * service role (contractor rows aren't world-readable) but stays cookie-less,
 * so ISR pages can call it without becoming dynamic.
 */
// Cached under the directory tag, like getCountyDirectory below, not
// memoised in the instance: revalidateDirectory() marks every county page
// stale when coverage changes, and the rebuild must read fresh rows. An
// in-memory copy would hand the re-render the counts from before the change
// and bake them into a page that is then cached for days (the memo's ten
// minutes were harmless while the pages expired daily).
// Excludes services_only contractors (county_coverage view, 20261011100000):
// "covered" means someone there takes general work. The hay and tractor-hire
// pages ask getCountyServiceCoverage for their own service instead.
export const getCountyCoverage = unstable_cache(
  async (): Promise<Record<string, number>> => {
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
  },
  ['county-coverage'],
  { tags: [COUNTY_DIRECTORY_TAG], revalidate: 600 },
);

/**
 * Approved contractors per county who offer one service, for the hay and
 * tractor-hire county pages' index gate and "N contractors" line. The general
 * count had every tractor-hire page in Northern Ireland claiming the one
 * contractor there, who sells straw. One memoised loader per service id.
 */
// Under the directory tag for the same reason as getCountyCoverage; the
// service id is part of the cache key.
export const getCountyServiceCoverage = unstable_cache(
  async (serviceId: number): Promise<Record<string, number>> => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('county_service_coverage')
      .select('name, contractors')
      .eq('service_id', serviceId);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.name && row.contractors) counts[row.name] = row.contractors;
    }
    return counts;
  },
  ['county-service-coverage'],
  { tags: [COUNTY_DIRECTORY_TAG], revalidate: 600 },
);

/** One Open member's listing on a county page (county_directory view). */
export type DirectoryEntry = {
  contractorId: string;
  businessName: string;
  website: string | null;
  blurb: string | null;
  services: number[];
  servicesOnly: boolean;
  ratingAvg: number | null;
  ratingCount: number;
};

/**
 * The Open members listed on each county page, keyed by county name
 * (county_directory view, 20261021110000). Service role like the coverage
 * counts. Cached under a tag rather than memoised in the instance: a
 * member who edits their listing clears it with revalidateTag, which an
 * in-memory copy on another instance would not hear about, and the county
 * pages it feeds are then rebuilt from fresh rows.
 */
export const getCountyDirectory = unstable_cache(
  async (): Promise<Record<string, DirectoryEntry[]>> => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('county_directory')
      .select('county, contractor_id, business_name, website, directory_blurb, services, services_only, rating_avg, rating_count')
      .order('business_name');
    const byCounty: Record<string, DirectoryEntry[]> = {};
    for (const row of data ?? []) {
      if (!row.county || !row.contractor_id || !row.business_name) continue;
      (byCounty[row.county] ??= []).push({
        contractorId: row.contractor_id,
        businessName: row.business_name,
        website: row.website,
        blurb: row.directory_blurb,
        services: row.services ?? [],
        servicesOnly: row.services_only ?? false,
        ratingAvg: row.rating_avg,
        ratingCount: row.rating_count ?? 0,
      });
    }
    return byCounty;
  },
  ['county-directory'],
  { tags: [COUNTY_DIRECTORY_TAG], revalidate: 600 },
);
