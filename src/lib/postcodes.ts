import { createServiceRoleClient } from '@/lib/supabase/server';
import { memoize, REFERENCE_TTL_MS } from '@/lib/memo';

export type CountyResolution = {
  ok: boolean;
  county_id?: number;
  county_name?: string;
  outcode?: string;
  town?: string | null;
  // Centroid of the postcode (or outcode) from postcodes.io. Populated
  // whenever the lookup found the postcode, even if no county resolved —
  // the geocode is useful on its own and must not be thrown away.
  lat?: number;
  lng?: number;
  via?: 'admin_county' | 'district_map' | 'outcode' | 'manual' | 'none';
  /** On an ambiguous outcode, the counties it straddles — so the caller can
   *  offer them rather than only naming them in an error string. */
  candidates?: { id: number; name: string }[];
  error?: string;
};

/**
 * Normalise free-text postcode input (Facebook leads arrive as "hg12rw",
 * "HG1 2RW.", outcode-only "HG1", …).
 * Returns the canonical full postcode when the input contains one, else the
 * outcode when the input is (or starts with) a valid outward code.
 */
const FULL_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
const OUTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;

/**
 * 0/O and 1/I are visually interchangeable and constantly mistyped ("s051"
 * for SO51). When the literal string doesn't parse, try every combination of
 * swapping those characters (≤8 chars, so a handful of candidates) and accept
 * the first that forms a valid postcode shape.
 */
function ambiguityCandidates(compact: string): string[] {
  const swaps: Record<string, string> = { '0': 'O', O: '0', '1': 'I', I: '1' };
  const positions = [...compact].flatMap((ch, i) => (swaps[ch] ? [i] : []));
  if (positions.length === 0 || positions.length > 4) return [];
  const out: string[] = [];
  for (let mask = 1; mask < 1 << positions.length; mask++) {
    const chars = [...compact];
    positions.forEach((pos, bit) => {
      if (mask & (1 << bit)) chars[pos] = swaps[chars[pos]];
    });
    out.push(chars.join(''));
  }
  return out;
}

export function normalisePostcode(raw: string): { full: string | null; outcode: string | null } {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const attempt = (s: string): { full: string | null; outcode: string | null } | null => {
    // Full postcode: outward code + inward code (always digit + 2 letters).
    if (FULL_RE.test(s)) {
      const outcode = s.slice(0, -3);
      return { full: `${outcode} ${s.slice(-3)}`, outcode };
    }
    // Outward code only ("HG1", "SO23").
    if (OUTCODE_RE.test(s)) return { full: null, outcode: s };
    return null;
  };

  const direct = attempt(compact);
  if (direct) return direct;
  for (const candidate of ambiguityCandidates(compact)) {
    const fixed = attempt(candidate);
    if (fixed) return fixed;
  }
  return { full: null, outcode: null };
}

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

/**
 * postcodes.io fetch with a timeout and one retry — a transient blip must not
 * force a manual county pick.
 */
async function fetchPostcodesIo(url: string): Promise<Response> {
  // A postcode's district and centroid do not change, so there was nothing for
  // 'no-store' to protect and a full round trip to postcodes.io sat on the
  // /start critical path for every submission. Cached for a day, the second
  // customer in an outcode we have already seen waits for nothing — and we
  // work two counties at a time, so that repeats far more than it looks.
  const opts = { next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000) } as const;
  try {
    return await fetch(url, opts);
  } catch {
    // One retry: postcodes.io blips, and a paid click must not dead-end on it.
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(4000) });
  }
}

/**
 * Match candidate ONS names against our counties: admin_county names against
 * counties.name, admin_district names through district_county_map.
 *
 * counties (88 rows) and district_county_map (186) are fixed taxonomy, so
 * they are loaded once and matched in memory. This used to be one or two
 * database round trips per postcode lookup, on the critical path of the step
 * the customer waits on.
 */
const countyIndex = memoize(async () => {
  const supabase = createServiceRoleClient();
  const [{ data: counties }, { data: districts }] = await Promise.all([
    supabase.from('counties').select('id, name'),
    supabase.from('district_county_map').select('county_id, admin_district, counties(name)'),
  ]);

  const byName = new Map<string, { id: number; name: string }>();
  for (const c of counties ?? []) byName.set(c.name.toLowerCase(), { id: c.id, name: c.name });

  const byDistrict = new Map<string, { id: number; name: string }>();
  for (const d of districts ?? []) {
    if (!d.county_id || !d.admin_district) continue;
    byDistrict.set(d.admin_district.toLowerCase(), {
      id: d.county_id,
      name: (d.counties as { name: string } | null)?.name ?? '',
    });
  }
  return { byName, byDistrict };
}, REFERENCE_TTL_MS);

async function matchCounties(
  _supabase: SupabaseClient,
  adminCounties: string[],
  adminDistricts: string[],
): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  const { byName, byDistrict } = await countyIndex();

  for (const name of adminCounties) {
    const hit = name ? byName.get(name.toLowerCase()) : undefined;
    if (hit) found.set(hit.id, hit.name);
  }
  for (const district of adminDistricts) {
    const hit = district ? byDistrict.get(district.toLowerCase()) : undefined;
    if (hit) found.set(hit.id, hit.name);
  }
  return found;
}

/**
 * Resolve a postcode to exactly one ceremonial county (spec §2.2).
 * Server-side only (reads district_county_map, which is service-role-gated).
 *
 * Order:
 *   1. full postcode via postcodes.io: admin_county → counties.name,
 *      else admin_district → district_county_map
 *   2. outcode via postcodes.io /outcodes (covers outcode-only input,
 *      terminated postcodes, and typos in the inward code) — accepted only
 *      when every candidate district/county agrees on a single county
 *   3. else fail (caller falls back to a manual county pick)
 */
export async function resolveCounty(postcode: string): Promise<CountyResolution> {
  const pc = postcode.trim();
  if (!pc) return { ok: false, via: 'none', error: 'Enter a postcode.' };

  const norm = normalisePostcode(pc);
  if (!norm.full && !norm.outcode) {
    return { ok: false, via: 'none', error: 'That doesn’t look like a UK postcode. Check it and try again.' };
  }

  const supabase = createServiceRoleClient();
  let town: string | null = null;
  let lat: number | undefined;
  let lng: number | undefined;
  let unresolvedDistrict: string | null = null;

  // 1) Full-postcode lookup.
  if (norm.full) {
    let result: {
      outcode?: string;
      admin_county?: string | null;
      admin_district?: string | null;
      admin_ward?: string | null;
      parish?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null = null;

    try {
      const res = await fetchPostcodesIo(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(norm.full)}`,
      );
      if (res.ok) {
        const json = await res.json();
        result = json.result;
      }
      // Non-ok (404 = unknown or terminated postcode) → fall through to the
      // outcode lookup below rather than failing outright.
    } catch {
      return {
        ok: false,
        via: 'none',
        outcode: norm.outcode ?? undefined,
        error: 'Could not reach the postcode lookup service.',
      };
    }

    if (result) {
      const outcode = result.outcode ?? norm.outcode ?? undefined;
      town = result.admin_ward || result.parish || result.admin_district || null;
      lat = result.latitude ?? undefined;
      lng = result.longitude ?? undefined;
      if (result.admin_county) {
        const byCounty = await matchCounties(supabase, [result.admin_county], []);
        const [first] = byCounty.entries();
        if (first) {
          return { ok: true, county_id: first[0], county_name: first[1], outcode, town, lat, lng, via: 'admin_county' };
        }
      }
      if (result.admin_district) {
        const byDistrict = await matchCounties(supabase, [], [result.admin_district]);
        const [first] = byDistrict.entries();
        if (first) {
          return { ok: true, county_id: first[0], county_name: first[1], outcode, town, lat, lng, via: 'district_map' };
        }
      }
      // Known postcode but its district isn't in our map — fall through to
      // the outcode lookup, which can still pin the county.
      unresolvedDistrict = result.admin_district ?? null;
    }
  }

  // 2) Outcode lookup — outcode-only input, or the full postcode wasn't found
  //    (mistyped inward code, terminated postcode).
  if (norm.outcode) {
    try {
      const res = await fetchPostcodesIo(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(norm.outcode)}`,
      );
      if (res.ok) {
        const json = await res.json();
        const result: {
          admin_county?: string[];
          admin_district?: string[];
          latitude?: number | null;
          longitude?: number | null;
        } | null = json.result;
        // Outcode centroid is coarser than a full-postcode fix — only use it
        // when the full lookup gave us nothing.
        lat = lat ?? result?.latitude ?? undefined;
        lng = lng ?? result?.longitude ?? undefined;
        const matched = await matchCounties(
          supabase,
          result?.admin_county ?? [],
          result?.admin_district ?? [],
        );
        // Only trust the outcode when it doesn't straddle a county border.
        if (matched.size === 1) {
          const [[id, name]] = matched.entries();
          return { ok: true, county_id: id, county_name: name, outcode: norm.outcode, town, lat, lng, via: 'outcode' };
        }
        if (matched.size > 1) {
          return {
            ok: false,
            via: 'none',
            outcode: norm.outcode,
            candidates: [...matched.entries()].map(([id, name]) => ({ id, name })),
            lat,
            lng,
            error: `“${norm.outcode}” spans more than one county (${[...matched.values()].join(', ')}). Pick one manually.`,
          };
        }
      }
    } catch {
      return {
        ok: false,
        via: 'none',
        outcode: norm.outcode,
        error: 'Could not reach the postcode lookup service.',
      };
    }
  }

  // 3) Unresolved — caller must pick manually. Keep any geocode we did get.
  return {
    ok: false,
    via: 'none',
    outcode: norm.outcode ?? undefined,
    town,
    lat,
    lng,
    error: `Could not resolve a county for “${unresolvedDistrict ?? pc}”. Pick one manually.`,
  };
}
