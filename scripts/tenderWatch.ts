/**
 * Run the tender watch from a terminal, with no function time limit.
 *
 * The daily cron takes a fortnight of award notices; this is how the
 * five-year renewal pipeline gets in (once, after the migration), and how to
 * re-fill after an outage.
 *
 *   npx tsx scripts/tenderWatch.ts                 five years of awards + 30 days of Find a Tender
 *   npx tsx scripts/tenderWatch.ts --dry-run       report only, write nothing
 *   npx tsx scripts/tenderWatch.ts --years 2 --fts-days 7
 *
 * Writes to whichever database .env.local points at.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { runTenderWatch } from '../src/lib/tenders/watch';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const num = (flag: string, dflt: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const dryRun = args.includes('--dry-run');
const years = num('--years', 5);
const ftsDays = num('--fts-days', 30);

const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const now = Date.now();
const awardsSince = new Date(now);
awardsSince.setUTCFullYear(awardsSince.getUTCFullYear() - years);
const HOUR = 3_600_000;

const s = await runTenderWatch(admin, {
  dryRun,
  awardsSince,
  findATenderSince: new Date(now - ftsDays * 86_400_000),
  budgetMs: { open: HOUR, awards: HOUR, findATender: HOUR },
});
console.log(JSON.stringify({ ...s, sample: s.sample.slice(0, 15) }, null, 2));
