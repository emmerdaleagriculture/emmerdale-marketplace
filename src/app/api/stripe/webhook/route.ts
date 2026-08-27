import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, syncSubscription } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';

/**
 * POST /api/stripe/webhook — Stripe events, one endpoint for both flows:
 * the (shelved) subscription tier, and sealed-quote job payments where the
 * AWARD is triggered by payment clearing (§27) — never by acceptance.
 *
 * Configure the endpoint in Stripe → Developers → Webhooks with events:
 *   checkout.session.completed, checkout.session.expired,
 *   customer.subscription.updated, customer.subscription.deleted
 * and set STRIPE_WEBHOOK_SECRET to the signing secret.
 */

function isJobPayment(session: Stripe.Checkout.Session): boolean {
  return session.mode === 'payment' && session.metadata?.kind === 'sq_job_payment';
}
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not set' }, { status: 500 });
  }

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (isJobPayment(session)) {
          // Payment cleared → transactional award. Idempotent on replay.
          const admin = createServiceRoleClient();
          const { data, error } = await admin.rpc('award_submission', {
            p_session_id: session.id,
          });
          if (error) throw error; // 500 → Stripe retries
          const res = data as { ok: boolean; reason?: string };
          if (!res.ok && res.reason === 'job_closed_manual_refund') {
            // Money into a closed job: held, never auto-refunded — operator
            // decides (§28). The RPC queued the alert; this is belt-and-braces.
            await notifyAdmins(
              'MANUAL REFUND NEEDED: payment into a closed job',
              `Stripe session ${session.id} paid for submission ${session.metadata?.submission_id} but the job was no longer awardable. Decide and refund in Stripe.`,
            );
          }
        } else if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (isJobPayment(session)) {
          // Link lapsed → acceptance void, job back to the price list (§27).
          const admin = createServiceRoleClient();
          const { error } = await admin.rpc('void_acceptance', { p_session_id: session.id });
          if (error) throw error;
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
