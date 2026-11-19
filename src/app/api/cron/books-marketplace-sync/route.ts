import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordCronRun } from '@/lib/cron/record';
import { cronAuthorised } from '@/lib/cronAuth';
import { syncLedgerMarketplace } from '@/lib/books/marketplace.server';
import type { Ledger } from '@/lib/books/server';
import { booksAllowList } from '@/lib/books/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET|POST /api/cron/books-marketplace-sync — nightly: each Books ledger with
 * marketplace posting on brings in signed-off jobs (sales to Emmerdale at the
 * contractor price) and our payouts. The Books home page runs the same sync
 * for its owner on each visit; this catches the rest. Re-runs post nothing twice.
 */
async function run() {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from('books_ledgers').select('*').eq('marketplace_auto', true).limit(5000);
  if (error) throw new Error(error.message);
  const ledgers = (data ?? []) as Ledger[];
  const allowed = await booksAllowList();
  const { data: owners } = await admin
    .from('contractors')
    .select('id, email')
    .in('id', ledgers.map((l) => l.contractor_id));
  const emailOf = new Map((owners ?? []).map((o) => [o.id, o.email]));
  let posted = 0;
  const failed: string[] = [];
  for (const l of ledgers) {
    if (!allowed(emailOf.get(l.contractor_id))) continue;
    try {
      posted += (await syncLedgerMarketplace(l)).posted;
    } catch (err) {
      failed.push(l.id);
      console.error('[books] marketplace sync failed', { ledger: l.id, error: err instanceof Error ? err.message : err });
    }
  }
  return { ledgers: ledgers.length, posted, failed };
}

async function handle(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const summary = await recordCronRun('books-marketplace-sync', async () => {
    const detail = await run();
    return { result: detail, detail };
  });
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
