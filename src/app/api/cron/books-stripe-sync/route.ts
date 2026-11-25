import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordCronRun } from '@/lib/cron/record';
import { cronAuthorised } from '@/lib/cronAuth';
import { stripeConfigured } from '@/lib/stripe';
import { syncLedgerStripe } from '@/lib/books/stripeSync';
import { bookUnsyncedPayouts } from '@/lib/books/bank.server';
import type { Ledger } from '@/lib/books/server';
import { booksAllowList } from '@/lib/books/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET|POST /api/cron/books-stripe-sync — nightly: each Books ledger with a
 * connected Stripe account brings in its fees, payouts and refunds, then
 * books any payout on a recent bank statement that the sync didn't account
 * for. One account failing doesn't stop the others; re-runs book nothing twice.
 */
async function run() {
  if (!stripeConfigured()) return { skipped: 'stripe not configured' };
  const { data, error } = await createServiceRoleClient()
    .from('books_ledgers')
    .select('*')
    .not('stripe_account_id', 'is', null)
    .limit(1000);
  if (error) throw new Error(error.message);
  let posted = 0;
  const failed: string[] = [];
  const ledgers = (data ?? []) as Ledger[];
  const allowed = await booksAllowList();
  const { data: owners } = await createServiceRoleClient()
    .from('contractors')
    .select('id, email')
    .in('id', ledgers.map((l) => l.contractor_id));
  const emailOf = new Map((owners ?? []).map((o) => [o.id, o.email]));
  for (const l of ledgers) {
    try {
      if (!allowed(emailOf.get(l.contractor_id))) continue;
      posted += (await syncLedgerStripe(l)).posted;
      // With the sync's new date, so a payout it has now had its chance at stops waiting.
      posted += await bookUnsyncedPayouts({ ...l, stripe_synced_at: new Date().toISOString() });
    } catch (err) {
      failed.push(l.id);
      console.error('[books] stripe sync failed', { ledger: l.id, error: err instanceof Error ? err.message : err });
    }
  }
  return { ledgers: (data ?? []).length, posted, failed };
}

async function handle(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const summary = await recordCronRun('books-stripe-sync', async () => {
    const detail = await run();
    return { result: detail, detail };
  });
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
