/**
 * Queue the contractor announcement — one row per approved contractor, drained
 * by the normal send-emails path so it gets the same retries, the same failure
 * handling and shows up on /admin/email like everything else.
 *
 * Deliberately not an sq_ contractor kind: those are redirected to the test
 * allowlist, and this one is meant to reach the real list. That is exactly why
 * it needs a dry run first.
 *
 *   # see who would get it, send nothing
 *   npx tsx scripts/sendContractorAnnouncement.ts
 *
 *   # one test to yourself
 *   npx tsx scripts/sendContractorAnnouncement.ts --only tom@example.com --send
 *
 *   # the real thing
 *   npx tsx scripts/sendContractorAnnouncement.ts --send
 *
 * READS .env.local, which after the 2026-09-04 migration still points at the
 * OLD project. Pass the live project explicitly:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/…
 */
import { readFileSync } from 'node:fs';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

const KIND = 'contractor_announcement';

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found`);
  return line.slice(name.length + 1).trim();
}

const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1]?.toLowerCase() : null;

  const { data: contractors, error } = await admin
    .from('contractors')
    .select('id, business_name, email, status')
    .eq('status', 'approved')
    .not('email', 'is', null)
    .order('business_name');
  if (error) throw new Error(error.message);

  let list = contractors ?? [];
  if (only) list = list.filter((c) => (c.email ?? '').toLowerCase() === only);

  // Never twice. A duplicate announcement is worse than none, and re-running
  // after a partial failure has to be safe.
  const { data: already } = await admin
    .from('pending_emails')
    .select('to_email')
    .eq('kind', KIND);
  const sent = new Set((already ?? []).map((r) => (r.to_email ?? '').toLowerCase()));
  const todo = list.filter((c) => !sent.has((c.email ?? '').toLowerCase()));

  console.log(`Approved contractors with an email: ${(contractors ?? []).length}`);
  if (only) console.log(`Filtered to --only ${only}: ${list.length}`);
  if (sent.size) console.log(`Already queued previously: ${sent.size} (skipped)`);
  console.log(`Would queue now: ${todo.length}`);
  for (const c of todo) console.log(`  ${c.email}  ${c.business_name ?? ''}`);

  if (!send) {
    console.log('\nDry run — nothing queued. Add --send to queue for real.');
    return;
  }
  if (todo.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  const rows = todo.map((c) => ({
    kind: KIND,
    to_email: c.email,
    payload: { business_name: c.business_name },
    status: 'pending',
  }));
  const { error: insErr } = await admin.from('pending_emails').insert(rows);
  if (insErr) throw new Error(insErr.message);

  console.log(`\nQueued ${rows.length}. The drain sends them within a minute.`);
  console.log('Watch /admin/email — anything that fails will show there.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
