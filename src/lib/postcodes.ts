import { createServiceRoleClient } from '@/lib/supabase/server';

export type CountyResolution = {
  ok: boolean;
  county_id?: number;
  county_name?: string;
  outcode?: string;
  town?: string | null;
  via?: 'admin_county' | 'district_map' | 'manual' | 'none';
  error?: string;
};

/**
 * Resolve a full postcode to exactly one ceremonial county (spec §2.2).
 * Server-side only (reads district_county_map, which is service-role-gated).
 *
 * Order:
 *   1. postcodes.io admin_county → match counties.name
 *   2. else admin_district → district_county_map
 *   3. else fail (caller falls back to a manual county pick)
 */
export async function resolveCounty(postcode: string): Promise<CountyResolution> {
  const pc = postcode.trim();
  if (!pc) return { ok: false, via: 'none', error: 'Enter a postcode.' };

  let result: {
    outcode?: string;
    admin_county?: string | null;
    admin_district?: string | null;
    admin_ward?: string | null;
    parish?: string | null;
  } | null = null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json();
      result = json.result;
    } else if (res.status === 404) {
      return { ok: false, via: 'none', error: 'Postcode not found. Check it and try again.' };
    }
  } catch {
    return { ok: false, via: 'none', error: 'Could not reach the postcode lookup service.' };
  }
  if (!result) {
    return { ok: false, via: 'none', error: 'Postcode not found.' };
  }

  const outcode = result.outcode ?? pc.split(' ')[0]?.toUpperCase();
  const town = result.admin_ward || result.parish || result.admin_district || null;
  const supabase = createServiceRoleClient();

  // 1) admin_county direct match
  if (result.admin_county) {
    const { data } = await supabase
      .from('counties')
      .select('id, name')
      .eq('name', result.admin_county)
      .maybeSingle();
    if (data) {
      return { ok: true, county_id: data.id, county_name: data.name, outcode, town, via: 'admin_county' };
    }
  }

  // 2) admin_district → district_county_map → counties
  if (result.admin_district) {
    const { data } = await supabase
      .from('district_county_map')
      .select('county_id, counties(name)')
      .eq('admin_district', result.admin_district)
      .maybeSingle();
    if (data?.county_id) {
      const name = (data.counties as { name: string } | null)?.name;
      return { ok: true, county_id: data.county_id, county_name: name, outcode, town, via: 'district_map' };
    }
  }

  // 3) unresolved — caller must pick manually
  return {
    ok: false,
    via: 'none',
    outcode,
    town,
    error: `Could not resolve a county for “${result.admin_district ?? pc}”. Pick one manually.`,
  };
}
