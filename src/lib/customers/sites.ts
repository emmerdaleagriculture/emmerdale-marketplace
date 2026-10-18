import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalisePostcode, resolveCounty } from '@/lib/postcodes';
import { getCountyCoverage } from '@/lib/reference';

/**
 * A customer's fields and paddocks (customer_sites, PRD task 6), and the
 * lookup behind "Where's your land?": a postcode or a position becomes a
 * postcode, a county and how many approved operators cover that county —
 * the same count the county pages publish. Never more than that: if the
 * county has nobody, the screen says so.
 */
export type Site = {
  id: string;
  label: string;
  postcode: string;
  acres: number | null;
  lat: number | null;
  lng: number | null;
  countyId: number | null;
};

export type LandLookup = {
  postcode: string;
  outcode: string;
  town: string | null;
  countyId: number | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
  operators: number;
};

export async function listSites(customerId: string): Promise<Site[]> {
  const { data } = await createServiceRoleClient()
    .from('customer_sites')
    .select('id, label, postcode, acres, lat, lng, county_id')
    .eq('customer_id', customerId)
    .order('created_at');
  return (data ?? []).map(({ county_id, ...s }) => ({
    ...s,
    countyId: county_id,
    acres: s.acres == null ? null : Number(s.acres),
  }));
}

export async function addSite(
  customerId: string,
  site: { label: string; postcode: string; countyId: number | null; lat: number | null; lng: number | null; acres: number | null },
): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .from('customer_sites')
    .insert({
      customer_id: customerId,
      label: site.label,
      postcode: site.postcode,
      county_id: site.countyId,
      lat: site.lat,
      lng: site.lng,
      acres: site.acres,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[sites] insert failed:', error.message);
    return null;
  }
  return data.id;
}

/** "SO41 8AB" → where it is and who covers it. Null when it is not a postcode we know. */
export async function lookupLand(raw: string): Promise<LandLookup | null> {
  const norm = normalisePostcode(raw);
  const query = norm.full ?? norm.outcode;
  if (!query) return null;
  const res = await resolveCounty(query);
  if (!res.ok && res.lat == null) return null;
  const coverage = await getCountyCoverage();
  return {
    postcode: norm.full ?? norm.outcode!,
    outcode: norm.outcode ?? res.outcode ?? '',
    town: res.town ?? null,
    countyId: res.county_id ?? null,
    county: res.county_name ?? null,
    lat: res.lat ?? null,
    lng: res.lng ?? null,
    operators: res.county_name ? coverage[res.county_name] ?? 0 : 0,
  };
}

/** The nearest postcode to a position (postcodes.io), or null off the map. */
export async function nearestPostcode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(lng)}&lat=${encodeURIComponent(lat)}&limit=1&radius=2000`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { postcode: string }[] | null };
    return j.result?.[0]?.postcode ?? null;
  } catch {
    return null;
  }
}
