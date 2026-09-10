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
/** The emailed fallback link for a balance the off-session charge couldn't take. */
function isBalancePayment(session: Stripe.Checkout.Session): boolean {
  return session.mode === 'payment' && session.metadata?.kind === 'sq_balance_payment';
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

          // The saved card. Checkout only puts setup_future_usage on the
          // intent, so the payment method has to be read back from it — and
          // without it every balance falls straight through to the emailed
          // link. Failing to read it must not block the award, so it is
          // logged and the job proceeds.
          let customerId: string | null =
            typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
          let paymentMethodId: string | null = null;
          if (intentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(intentId);
              paymentMethodId =
                typeof pi.payment_method === 'string'
                  ? pi.payment_method
                  : (pi.payment_method?.id ?? null);
              customerId =
                customerId ??
                (typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? null));
            } catch (err) {
              console.error('[stripe] could not read the saved card off the intent:', err);
            }
            const { error: intentError } = await admin
              .from('job_payments')
              .update({
                stripe_payment_intent_id: intentId,
                stripe_customer_id: customerId,
                stripe_payment_method_id: paymentMethodId,
              })
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
        } else if (isBalancePayment(session)) {
          // The fallback link: the customer paying a balance by hand after the
          // off-session charge gave up. Same settlement path as the worker's,
          // so a job cannot end up half-settled depending on which route the
          // money came in by.
          const admin = createServiceRoleClient();
          const paymentId = session.metadata?.payment_id;
          const intentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null);
          if (!paymentId) {
            await notifyAdmins(
              'PAYMENT NEEDS A HUMAN: balance paid with no payment_id',
              `Stripe session ${session.id} settled a balance but carried no payment_id in ` +
                `its metadata, so it could not be matched to a job. Investigate.`,
            );
          } else {
            const { error } = await admin.rpc('sq_settle_balance', {
              p_payment_id: paymentId,
              p_intent_id: intentId ?? session.id,
            });
            if (error) throw error; // 500 → Stripe retries
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
        // Deliberately only the deposit link. A balance link lapsing means the
        // customer didn't get round to it — the debt stands and the chase
        // continues; voiding the acceptance would un-award a finished job.
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
