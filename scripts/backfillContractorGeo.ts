/**
 * One-off: geocode contractor base postcodes → base_lat/base_lng, for the
 * display-only distance in invitations (spec §15 — never a match filter).
 * New signups geocode at onboarding; this covers everyone who predates that.
 *
 * Run:  npx tsx scripts/backfillContractorGeo.ts
 */
import { readFileSync } from 'node:fs';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

// supabase-js on Node 20 needs a WebSocket implementation even though this
// script never touches realtime.
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
  const urls = [
    `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`,
    `https://api.postcodes.io/outcodes/${encodeURIComponent(compact.replace(/[0-9][A-Z]{2}$/, ''))}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const r = json.result;
      if (r?.latitude != null && r?.longitude != null) return { lat: r.latitude, lng: r.longitude };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  const { data: contractors, error } = await admin
    .from('contractors')
    .select('id, business_name, base_postcode')
    .is('base_lat', null);
  if (error) throw error;

  console.log(`${contractors?.length ?? 0} contractors need geocoding`);
  let done = 0;
  for (const c of contractors ?? []) {
    const geo = await lookup(c.base_postcode);
    if (!geo) {
      console.warn(`  ✗ ${c.business_name} (${c.base_postcode}) — no fix`);
      continue;
    }
    const { error: upErr } = await admin
      .from('contractors')
      .update({ base_lat: geo.lat, base_lng: geo.lng })
      .eq('id', c.id);
    if (upErr) console.warn(`  ✗ ${c.business_name}: ${upErr.message}`);
    else {
      done++;
      console.log(`  ✓ ${c.business_name} (${c.base_postcode})`);
    }
    await new Promise((r) => setTimeout(r, 150)); // be polite to postcodes.io
  }
  console.log(`Done: ${done} geocoded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
