/**
 * Clear ALL sealed-quote funnel data — submissions, invitations, quotes,
 * payments, events, emails, photos — plus the page-interaction beacons, and
 * reset contractor ratings that test runs produced. For the test period, when every row in this funnel is test
 * data. Touches NOTHING outside the funnel (jobs, leads, contractors'
 * profiles stay).
 *
 * Run between test rounds:
 *   npx tsx scripts/clearSealedQuoteTestData.ts
 *
 * IT READS .env.local, which after the 2026-09-04 migration still points at
 * the OLD project kept for rollback. Pass the live project explicitly, or this
 * wipes the rollback and leaves production untouched:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/…
 */
import { readFileSync } from 'node:fs';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

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

async function wipe(table: string, timeColumn = 'created_at') {
  // FK-ordered deletes below; each table is cleared completely.
  const { error } = await admin.from(table).delete().gte(timeColumn, '1970-01-01');
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ✓ ${table}`);
}

async function main() {
  console.log('Clearing sealed-quote funnel test data…');

  // Photos first (paths come from the rows we're about to delete).
  const { data: subs } = await admin.from('job_submissions').select('photo_paths');
  const paths = (subs ?? []).flatMap((s) => (s.photo_paths ?? []) as string[]);
  if (paths.length) {
    const { error } = await admin.storage.from('job-photos').remove(paths);
    console.log(error ? `  ✗ photos: ${error.message}` : `  ✓ photos (${paths.length})`);
  } else {
    console.log('  ✓ photos (none)');
  }

  // job_submissions points back into client_quotes via the accepted-quote
  // FK — break that link before the deletes.
  await admin
    .from('job_submissions')
    .update({ accepted_client_quote_id: null })
    .not('accepted_client_quote_id', 'is', null);

  // Children → parents, FK order.
  for (const table of [
    'inbound_email_events',
    'invitation_events',
    'job_events',
    'contractor_ratings',
    'job_payments',
    'client_quotes',
    'contractor_quotes',
    'job_submission_parses',
    'job_parse_events',
    'landing_views',
  ]) {
    await wipe(table);
  }
  await wipe('job_invitations', 'sent_at');
  await wipe('submission_notifications', 'sent_at');

  // job_submissions last — everything above referenced it.
  await wipe('job_submissions');

  // Funnel emails (leave open-access board kinds alone).
  const { error: mailErr } = await admin.from('pending_emails').delete().like('kind', 'sq_%');
  console.log(mailErr ? `  ✗ pending_emails: ${mailErr.message}` : '  ✓ pending_emails (sq_* kinds)');

  // Browsing recorded while testing: clicks and scroll depth on / and /start.
  // Not part of the funnel, but it is test data by the same argument, and
  // leaving it makes the first real heat map a map of us.
  await wipe('page_events');

  // Ratings produced by tests are gone — reset the denormalised columns.
  const { error: ctErr } = await admin
    .from('contractors')
    .update({ rating_avg: null, rating_count: 0 })
    .gt('rating_count', 0);
  console.log(ctErr ? `  ✗ contractors: ${ctErr.message}` : '  ✓ contractor ratings reset');

  console.log('Done — the funnel is empty and ready for the next test round.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
