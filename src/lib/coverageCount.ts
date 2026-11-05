import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalisePostcode, resolveCounty } from '@/lib/postcodes';
import { serviceFromPick } from '@/lib/jobParse/servicePick';
import type { CoverageAnswer } from '@/lib/coverageLine';

/**
 * How many contractors a postcode would reach: the number the widget, /start
 * and the confirm page show as soon as a postcode goes in.
 *
 * Postcode → county and point through the same resolver the parse pipeline
 * uses, then sq_coverage_count, which applies the invitation rule itself
 * (sq_contractor_wants_service) — county, approved and vetted, inside each
 * contractor's own radius, and ticking the card's service (or everyone, if
 * nobody in the county ticks it). One source of truth: if distribution
 * changes who it invites, this changes with it.
 *
 * `service` is a front-page card slug, or nothing. A free-text job has no
 * service yet, so it gets the count a job with no service would reach; once
 * classified it may reach fewer (only those who tick its service).
 */
export async function coverageForPostcode(
  raw: string,
  service?: string | null,
): Promise<CoverageAnswer> {
  const norm = normalisePostcode(raw);
  if (!norm.full && !norm.outcode) return { ok: false, reason: 'shape' };

  const res = await resolveCounty(raw);
  if (!res.ok || res.county_id == null) {
    if (res.candidates?.length) return { ok: false, reason: 'border' };
    if (res.error?.startsWith('Could not reach')) return { ok: false, reason: 'lookup' };
    return { ok: false, reason: 'unknown' };
  }

  const { data, error } = await createServiceRoleClient().rpc('sq_coverage_count', {
    p_county_id: res.county_id,
    p_lat: res.lat ?? null,
    p_lng: res.lng ?? null,
    p_service_name: serviceFromPick(service) ?? null,
  });
  if (error || typeof data !== 'number') {
    console.error('[coverage] count failed:', error);
    return { ok: false, reason: 'lookup' };
  }
  return {
    ok: true,
    count: data,
    county: res.county_name ?? '',
    outcode: res.outcode ?? norm.outcode ?? '',
  };
}
