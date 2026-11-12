import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordCronRun } from '@/lib/cron/record';
import { cronAuthorised } from '@/lib/cronAuth';
import { runTenderWatch, type WatchOptions } from '@/lib/tenders/watch';
import type { Json } from '@/lib/database.types';

/**
 * /api/cron/tender-watch — the daily council-contract scan behind Open
 * members' Council tenders page (/account/tenders).
 *
 * GET  — Vercel cron, 06:00 UTC: open notices + the last fortnight of award
 *        notices from Contracts Finder, and three days of Find a Tender.
 * POST — manual run. Query flags:
 *          ?dryRun=1              report what would be created, write nothing
 *          ?since=2026-10-01      page Find a Tender back to this date
 *          ?awardsSince=2026-01-01 take award notices back to this date
 *        The five-year renewal backfill is too long for one function; run
 *        scripts/tenderWatch.ts for that.
 *
 * Both require the cron secret. A source failing is reported in the run's
 * detail, not thrown: the next day's lookback covers a bad day.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(opts: WatchOptions) {
  const summary = await recordCronRun('tender-watch', async () => {
    const s = await runTenderWatch(createServiceRoleClient(), opts);
    const fetched = s.fetched.contractsFinderOpen + s.fetched.contractsFinderAwards + s.fetched.findATender;
    if (fetched === 0 && s.errors.length) throw new Error(`every source failed: ${s.errors.slice(0, 5).join(' | ')}`);
    const detail = { ...s, sample: s.sample.slice(0, 10), errors: s.errors.slice(0, 30) };
    return { result: s, detail: detail as unknown as Json };
  });
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return handle({});
}

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const date = (k: string) => {
    const v = q.get(k);
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const since = date('since');
  const awardsSince = date('awardsSince');
  if (since === null || awardsSince === null) {
    return NextResponse.json({ error: 'bad date' }, { status: 400 });
  }
  return handle({ dryRun: q.get('dryRun') === '1', findATenderSince: since, awardsSince });
}
