/**
 * One-off, re-runnable: repair jobs that were stored without coordinates.
 *
 * Until PR #286 the portal enquiry flow (hay, tractor hire, county pages) and
 * the admin lead-publish path kept a job's postcode but threw away the lat/lng
 * the resolver had already fetched. Without them every contractor channel
 * drops the "N miles from your base" line and the invite radius cannot be
 * measured. First run (2026-10-29): 28 jobs, 544 invitations.
 *
 * Three passes, none of which touches a status column, so no trigger fires and
 * nothing is sent:
 *   1. postcode present, lat null → postcodes.io centroid (outcode fallback)
 *   2. invitations on those jobs with distance_miles null → recomputed where
 *      the contractor's base is geocoded
 *   3. postcodes stored unspaced ("SO249AA") → canonical "SO24 9AA", because
 *      the pre-award district redaction is split_part(postcode, ' ', 1)
 *
 * Run:  npx tsx scripts/backfillJobGeo.ts
 */
import { readFileSync } from 'node:fs';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import { haversineMiles } from '../src/lib/sealedQuotes/geo';
import { normalisePostcode } from '../src/lib/postcodes';

(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found`);
  return line.slice(name.length + 1).trim();
}

const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

async function lookup(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const compact = postcode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const outcode = compact.replace(/[0-9][A-Z]{2}$/, '');
  const urls = [
    `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`,
    `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const r = json.result;
      if (r?.latitude != null && r?.longitude != null) return { lat: r.latitude, lng: r.longitude };
    } catch {
      // fall through to the next url
    }
  }
  return null;
}

async function main() {
  // 1. coordinates
  const { data: jobs, error } = await admin
    .from('job_submissions')
    .select('id, postcode')
    .is('lat', null)
    .not('postcode', 'is', null);
  if (error) throw error;
  const fixed: string[] = [];
  for (const j of jobs ?? []) {
    const geo = await lookup(j.postcode!);
    if (!geo) {
      console.log(`unresolved ${j.id} ${j.postcode}`);
      continue;
    }
    const { error: upErr } = await admin.from('job_submissions').update({ lat: geo.lat, lng: geo.lng }).eq('id', j.id);
    if (upErr) throw upErr;
    fixed.push(j.id);
    await new Promise((r) => setTimeout(r, 150)); // be polite to postcodes.io
  }
  console.log(`coordinates: ${fixed.length}/${jobs?.length ?? 0} jobs`);

  // 2. distances on their invitations
  let distances = 0;
  if (fixed.length) {
    const { data: invs, error: invErr } = await admin
      .from('job_invitations')
      .select('id, submission_id, contractor_id, job_submissions!inner(lat, lng), contractors!inner(base_lat, base_lng)')
      .in('submission_id', fixed)
      .is('distance_miles', null);
    if (invErr) throw invErr;
    for (const inv of invs ?? []) {
      const js = inv.job_submissions as unknown as { lat: number | null; lng: number | null };
      const ct = inv.contractors as unknown as { base_lat: number | null; base_lng: number | null };
      if (js.lat == null || js.lng == null || ct.base_lat == null || ct.base_lng == null) continue;
      const miles = Math.round(haversineMiles(js.lat, js.lng, ct.base_lat, ct.base_lng) * 10) / 10;
      const { error: dErr } = await admin.from('job_invitations').update({ distance_miles: miles }).eq('id', inv.id);
      if (dErr) throw dErr;
      distances++;
    }
  }
  console.log(`distances: ${distances} invitations`);

  // 3. canonical postcodes
  const { data: unspaced, error: pcErr } = await admin
    .from('job_submissions')
    .select('id, postcode')
    .not('postcode', 'is', null)
    .not('postcode', 'like', '% %');
  if (pcErr) throw pcErr;
  let renamed = 0;
  for (const j of unspaced ?? []) {
    const norm = normalisePostcode(j.postcode!);
    if (!norm.full || norm.full === j.postcode) continue;
    const { error: nErr } = await admin.from('job_submissions').update({ postcode: norm.full }).eq('id', j.id);
    if (nErr) throw nErr;
    renamed++;
  }
  console.log(`postcodes respaced: ${renamed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
