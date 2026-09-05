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
          // The payment intent is the only handle a refund can be issued
          // against, and the column for it had never been written — so a
          // cancellation had nothing to refund. Stored before the award so a
          // failure here is visible in the same alert.
          const intentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null);
          if (intentId) {
            const { error: intentError } = await admin
              .from('job_payments')
              .update({ stripe_payment_intent_id: intentId })
              .eq('stripe_checkout_session_id', session.id);
            if (intentError) {
              console.error('[stripe] could not store the payment intent:', intentError);
            }
          }

          const { data, error } = await admin.rpc('award_submission', {
            p_session_id: session.id,
          });
          if (error) throw error; // 500 → Stripe retries
          const res = data as { ok: boolean; reason?: string };
          if (!res.ok) {
            // ANY failed award after a successful charge needs a human — a
            // silent 200 here is a customer charged with no job and no alert.
            // (unknown_session = no job_payments row was ever written.)
            await notifyAdmins(
              res.reason === 'job_closed_manual_refund'
                ? 'MANUAL REFUND NEEDED: payment into a closed job'
                : `PAYMENT NEEDS A HUMAN: award failed (${res.reason ?? 'unknown'})`,
              `Stripe session ${session.id} completed payment for submission ` +
                `${session.metadata?.submission_id ?? '(unknown)'} but the award did not ` +
                `happen (reason: ${res.reason ?? 'unknown'}). The money has been taken — ` +
                `investigate and refund or award manually.`,
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
