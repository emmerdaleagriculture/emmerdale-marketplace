import { createServiceRoleClient } from '@/lib/supabase/server';

export type CountyResolution = {
  ok: boolean;
  county_id?: number;
  county_name?: string;
  outcode?: string;
  town?: string | null;
  via?: 'admin_county' | 'district_map' | 'outcode' | 'manual' | 'none';
  error?: string;
};

/**
 * Normalise free-text postcode input (Facebook leads arrive as "hg12rw",
 * "HG1 2RW.", outcode-only "HG1", …).
 * Returns the canonical full postcode when the input contains one, else the
 * outcode when the input is (or starts with) a valid outward code.
 */
export function normalisePostcode(raw: string): { full: string | null; outcode: string | null } {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Full postcode: outward code + inward code (always digit + 2 letters).
  if (/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) {
    const outcode = compact.slice(0, -3);
    return { full: `${outcode} ${compact.slice(-3)}`, outcode };
  }
  // Outward code only ("HG1", "SO23").
  if (/^[A-Z]{1,2}[0-9][A-Z0-9]?$/.test(compact)) {
    return { full: null, outcode: compact };
  }
  return { full: null, outcode: null };
}

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Match candidate ONS names against our counties. admin_county names are
 * matched on counties.name; admin_district names go through
 * district_county_map. Returns the distinct county ids found.
 */
async function matchCounties(
  supabase: SupabaseClient,
  adminCounties: string[],
  adminDistricts: string[],
): Promise<Map<number, string>> {
  const found = new Map<number, string>();

  if (adminCounties.length) {
    const { data } = await supabase
      .from('counties')
      .select('id, name')
      .in('name', adminCounties);
    for (const c of data ?? []) found.set(c.id, c.name);
  }
  if (adminDistricts.length) {
    const { data } = await supabase
      .from('district_county_map')
      .select('county_id, counties(name)')
      .in('admin_district', adminDistricts);
    for (const d of data ?? []) {
      if (d.county_id) found.set(d.county_id, (d.counties as { name: string } | null)?.name ?? '');
    }
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
  let unresolvedDistrict: string | null = null;

  // 1) Full-postcode lookup.
  if (norm.full) {
    let result: {
      outcode?: string;
      admin_county?: string | null;
      admin_district?: string | null;
      admin_ward?: string | null;
      parish?: string | null;
    } | null = null;

    try {
      const res = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(norm.full)}`,
        { cache: 'no-store' },
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
      if (result.admin_county) {
        const byCounty = await matchCounties(supabase, [result.admin_county], []);
        const [first] = byCounty.entries();
        if (first) {
          return { ok: true, county_id: first[0], county_name: first[1], outcode, town, via: 'admin_county' };
        }
      }
      if (result.admin_district) {
        const byDistrict = await matchCounties(supabase, [], [result.admin_district]);
        const [first] = byDistrict.entries();
        if (first) {
          return { ok: true, county_id: first[0], county_name: first[1], outcode, town, via: 'district_map' };
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
      const res = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(norm.outcode)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const json = await res.json();
        const result: { admin_county?: string[]; admin_district?: string[] } | null = json.result;
        const matched = await matchCounties(
          supabase,
          result?.admin_county ?? [],
          result?.admin_district ?? [],
        );
        // Only trust the outcode when it doesn't straddle a county border.
        if (matched.size === 1) {
          const [[id, name]] = matched.entries();
          return { ok: true, county_id: id, county_name: name, outcode: norm.outcode, town, via: 'outcode' };
        }
        if (matched.size > 1) {
          return {
            ok: false,
            via: 'none',
            outcode: norm.outcode,
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

  // 3) Unresolved — caller must pick manually.
  return {
    ok: false,
    via: 'none',
    outcode: norm.outcode ?? undefined,
    town,
    error: `Could not resolve a county for “${unresolvedDistrict ?? pc}”. Pick one manually.`,
  };
}
