import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';

/**
 * POST|GET /api/cron/balances — charge the balances that sign-off made due.
 *
 * Why a worker and not an inline charge at sign-off: the two things that sign a
 * job off are a SQL function behind a server action and an hourly pg_cron job,
 * and neither can call Stripe. Both open a 'due' row instead; this drains it.
 * That also gives retries, a back-off, and the emailed fallback link somewhere
 * to live, which an off-session charge always eventually needs.
 *
 * Claiming is transactional (SELECT … FOR UPDATE SKIP LOCKED plus an immediate
 * attempts bump), so two overlapping runs can never charge the same card
 * twice. A row this run has claimed but not yet resolved is invisible to the
 * next one.
 */

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const BATCH = 20;

/** Vercel Cron sends a bearer token; the SQL scheduler sends a header. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get('x-cron-secret') === secret;
}

type Claim = {
  payment_id: string;
  submission_id: string;
  amount_pence: number;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  attempts: number;
  /** From app_config, so the worker and the claim gate cannot disagree. */
  max_attempts: number;
  contact_email: string | null;
  client_token: string | null;
};

/**
 * The last resort: a hosted page for a balance we could not take ourselves.
 * Its metadata carries the payment id so the webhook settles the same row this
 * worker gave up on, rather than opening a second one.
 */
async function sendPaymentLink(stripe: Stripe, claim: Claim): Promise<string | null> {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: claim.amount_pence,
            product_data: { name: 'Balance due — completed job' },
          },
          quantity: 1,
        },
      ],
      customer: claim.stripe_customer_id ?? undefined,
      customer_email: claim.stripe_customer_id ? undefined : (claim.contact_email ?? undefined),
      metadata: {
        kind: 'sq_balance_payment',
        payment_id: claim.payment_id,
        submission_id: claim.submission_id,
      },
      payment_intent_data: {
        metadata: { kind: 'sq_balance_payment', payment_id: claim.payment_id },
      },
      success_url: `${SITE()}/my/${claim.client_token ?? ''}?paid=1`,
      cancel_url: `${SITE()}/my/${claim.client_token ?? ''}`,
    });
    return session.url ?? null;
  } catch (err) {
    console.error('[balances] could not mint a fallback link:', err);
    return null;
  }
}

async function run(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    // No keys configured is not an error worth alerting on every ten minutes.
    console.error('[balances] Stripe not configured:', err);
    return NextResponse.json({ skipped: 'stripe-not-configured' });
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('sq_claim_due_balances', { p_limit: BATCH });
  if (error) {
    console.error('[balances] claim failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const claims = (data ?? []) as Claim[];

  let charged = 0;
  let failed = 0;

  for (const claim of claims) {
    // No saved card — nothing to attempt. Go straight to the link rather than
    // burning an attempt on a charge that cannot be made.
    if (!claim.stripe_customer_id || !claim.stripe_payment_method_id) {
      const url = await sendPaymentLink(stripe, claim);
      await admin.rpc('sq_fail_balance', {
        p_payment_id: claim.payment_id,
        p_error: `no saved card on file${url ? ` — link sent` : ''}`,
        p_final: true,
      });
      failed += 1;
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount: claim.amount_pence,
        currency: 'gbp',
        customer: claim.stripe_customer_id,
        payment_method: claim.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Balance — ${formatGBP(claim.amount_pence)}`,
        metadata: {
          kind: 'sq_balance_charge',
          payment_id: claim.payment_id,
          submission_id: claim.submission_id,
        },
      },
      // One key per payment row per attempt: a run that dies between the
      // charge and the settle cannot take the money twice on the way back.
      { idempotencyKey: `bal_${claim.payment_id}_${claim.attempts}` });

      if (intent.status === 'succeeded') {
        const { error: settleError } = await admin.rpc('sq_settle_balance', {
          p_payment_id: claim.payment_id,
          p_intent_id: intent.id,
        });
        if (settleError) throw settleError;
        charged += 1;
      } else {
        // requires_action and friends: the cardholder has to be present, which
        // by definition this worker is not. That is the link's job.
        const isFinal = claim.attempts >= claim.max_attempts;
        if (isFinal) await sendPaymentLink(stripe, claim);
        await admin.rpc('sq_fail_balance', {
          p_payment_id: claim.payment_id,
          p_error: `intent ${intent.status}`,
          p_final: isFinal,
        });
        failed += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFinal = claim.attempts >= claim.max_attempts;
      if (isFinal) await sendPaymentLink(stripe, claim);
      await admin.rpc('sq_fail_balance', {
        p_payment_id: claim.payment_id,
        p_error: message,
        p_final: isFinal,
      });
      failed += 1;
    }
  }

  return NextResponse.json({ claimed: claims.length, charged, failed });
}

export async function POST(request: Request) {
  return run(request);
}
// Vercel Cron issues a GET.
export async function GET(request: Request) {
  return run(request);
}
