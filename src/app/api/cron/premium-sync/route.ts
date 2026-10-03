import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordCronRun } from '@/lib/cron/record';
import { getStripe, syncSubscription } from '@/lib/stripe';

/**
 * GET|POST /api/cron/premium-sync — re-read every premium membership from
 * Stripe, nightly.
 *
 * The webhook is the fast path, but nobody could confirm the live endpoint
 * sends customer.subscription.updated/deleted (3 Oct 2026). Without them a
 * renewal never moves current_period_end, and contractor_is_premium() turns a
 * paying member off three days after their first period ends while Stripe
 * goes on charging them. This makes the webhook an optimisation rather than a
 * dependency: whatever it missed, this puts right by morning.
 */

export const dynamic = 'force-dynamic';

const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid']);

/** Vercel Cron sends a bearer token; the SQL scheduler sends a header. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get('x-cron-secret') === secret;
}

async function run() {
  if (!process.env.STRIPE_SECRET_KEY) return { skipped: 'stripe not configured' };
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from('subscriptions')
    .select('contractor_id, stripe_customer_id, status')
    .not('stripe_customer_id', 'is', null)
    .limit(1000);
  if (error) throw new Error(error.message);

  const stripe = getStripe();
  let synced = 0;
  let ended = 0;
  const failed: string[] = [];
  for (const row of rows ?? []) {
    try {
      const { data: subs } = await stripe.subscriptions.list({
        customer: row.stripe_customer_id!,
        status: 'all',
        limit: 10,
      });
      // The live one if there is one, else the most recent.
      const pick =
        subs.find((s) => LIVE.has(s.status)) ?? [...subs].sort((a, b) => b.created - a.created)[0];
      if (pick) {
        await syncSubscription(pick);
        synced++;
      } else if (row.status === 'active' || row.status === 'past_due') {
        // We think they're a member and Stripe has no subscription at all.
        await admin
          .from('subscriptions')
          .update({ status: 'canceled', ended_at: new Date().toISOString() })
          .eq('contractor_id', row.contractor_id);
        ended++;
      }
    } catch (err) {
      console.error('[premium-sync]', row.contractor_id, err);
      failed.push(row.contractor_id);
    }
  }
  if (failed.length) throw new Error(`${failed.length} of ${(rows ?? []).length} failed: ${failed.join(', ')}`);
  return { customers: (rows ?? []).length, synced, ended };
}

async function handle(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const summary = await recordCronRun('premium-sync', async () => {
    const detail = await run();
    return { result: detail, detail };
  });
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
