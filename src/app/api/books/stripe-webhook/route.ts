import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { applyAccount, confirmCheckout } from '@/lib/books/stripeConnect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/books/stripe-webhook — Stripe Connect events from contractors'
 * own accounts ("Events on Connected accounts" in the Stripe dashboard,
 * signing secret in STRIPE_CONNECT_WEBHOOK_SECRET):
 *
 *   checkout.session.completed / async_payment_succeeded  record the invoice payment
 *   account.updated                                        keep charges_enabled current
 *
 * The return from Checkout records the payment too; the payment's external id
 * makes whichever comes second a no-op.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'STRIPE_CONNECT_WEBHOOK_SECRET not set' }, { status: 500 });
  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no signature' }, { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.books_invoice && event.account) await confirmCheckout(session.id, event.account);
        break;
      }
      case 'account.updated':
        await applyAccount(event.data.object as Stripe.Account);
        break;
    }
  } catch (err) {
    console.error('[books] stripe webhook failed', { type: event.type, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
