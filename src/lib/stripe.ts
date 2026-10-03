import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';

/** Stripe client — throws if the key isn't set (paid tier not configured yet). */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — the paid tier is not configured.');
  // Pin the API version; cast avoids coupling to the SDK's version literal type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(key, { apiVersion: '2024-06-20' as any });
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Premium membership. The prices live in Stripe under these lookup keys and
 * are created on first use, so there is nothing to set up by hand and no
 * price id to keep in an env var. Changing an amount means a new lookup key:
 * a Stripe price is immutable, and existing subscribers stay on the old one.
 */
export const PREMIUM_PLANS = {
  monthly: { lookupKey: 'premium_monthly_2000', amountPence: 2000, interval: 'month' },
  annual: { lookupKey: 'premium_annual_19900', amountPence: 19900, interval: 'year' },
} as const;
export type PremiumPlan = keyof typeof PREMIUM_PLANS;

export async function premiumPriceId(stripe: Stripe, plan: PremiumPlan): Promise<string> {
  const keys = Object.values(PREMIUM_PLANS).map((p) => p.lookupKey);
  const { data } = await stripe.prices.list({ lookup_keys: keys, active: true, limit: 10 });
  const want = PREMIUM_PLANS[plan];
  const found = data.find((p) => p.lookup_key === want.lookupKey);
  if (found) return found.id;
  // Both plans under one product, so Stripe reports them as one thing.
  const sibling = data[0];
  const product = sibling
    ? typeof sibling.product === 'string'
      ? sibling.product
      : sibling.product.id
    : null;
  const price = await stripe.prices.create({
    currency: 'gbp',
    unit_amount: want.amountPence,
    recurring: { interval: want.interval },
    lookup_key: want.lookupKey,
    ...(product ? { product } : { product_data: { name: 'Premium membership' } }),
  });
  return price.id;
}

/** Map a Stripe subscription status to our subscriptions.status enum. */
function mapStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' | 'none' {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    default:
      return 'none';
  }
}

/**
 * Upsert our subscriptions row from a Stripe subscription object, keyed by the
 * Stripe customer id. Called from webhook handlers.
 */
export async function syncSubscription(sub: Stripe.Subscription) {
  const admin = createServiceRoleClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const { data: existing } = await admin
    .from('subscriptions')
    .select('contractor_id, status')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!existing) return; // unknown customer — nothing to update

  // Stripe moved current_period_end from the subscription to its items in newer
  // API versions; read from items, falling back to the legacy top-level field.
  const periodEndUnix =
    sub.items?.data?.[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;

  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  const status = mapStatus(sub.status);

  const { error } = await admin
    .from('subscriptions')
    .update({
      stripe_subscription_id: sub.id,
      status,
      plan: interval === 'year' ? 'annual' : interval === 'month' ? 'monthly' : null,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      // Start and end of a membership, for the admin figures. A renewal is
      // neither; a lapse back to active after past_due is not a new start.
      ...(status === 'active' && existing.status !== 'active' && existing.status !== 'past_due'
        ? { started_at: new Date().toISOString(), ended_at: null }
        : {}),
      ...(status === 'canceled' && existing.status !== 'canceled'
        ? { ended_at: new Date().toISOString() }
        : {}),
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    })
    .eq('contractor_id', existing.contractor_id);
  if (error) throw error; // → 500, Stripe retries

  // Newly premium: catch up on jobs already in a premium window in their
  // counties, and tell us. A renewal (already active) does neither.
  if (status === 'active' && existing.status !== 'active' && existing.status !== 'past_due') {
    const { error: inviteError } = await admin.rpc('invite_contractor_to_open_jobs', {
      p_contractor_id: existing.contractor_id,
    });
    if (inviteError) console.error('[stripe] premium catch-up invites failed:', inviteError.message);
    const { data: ct } = await admin
      .from('contractors')
      .select('business_name')
      .eq('id', existing.contractor_id)
      .maybeSingle();
    await notifyAdmins(
      `New premium member: ${ct?.business_name ?? existing.contractor_id}`,
      `${ct?.business_name ?? 'A contractor'} has started a ${interval === 'year' ? 'yearly' : 'monthly'} ` +
        `premium membership.\n\n${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/contractors/${existing.contractor_id}`,
    );
  }
}

/**
 * A Checkout session for a premium plan, for this contractor. Reuses (or
 * creates) their Stripe customer. Shared by the dashboard button and the
 * choice at the end of onboarding.
 */
export async function premiumCheckoutUrl(
  contractorId: string,
  plan: PremiumPlan,
  returnPath = '/account',
): Promise<string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const admin = createServiceRoleClient();
  const [{ data: contractor }, { data: sub }] = await Promise.all([
    admin.from('contractors').select('email, business_name').eq('id', contractorId).maybeSingle(),
    admin.from('subscriptions').select('stripe_customer_id').eq('contractor_id', contractorId).maybeSingle(),
  ]);
  if (!contractor) throw new Error('No contractor profile.');

  const stripe = getStripe();
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: contractor.email,
      name: contractor.business_name,
      metadata: { contractor_id: contractorId },
    });
    customerId = customer.id;
    await admin
      .from('subscriptions')
      .upsert({ contractor_id: contractorId, stripe_customer_id: customerId, status: 'none' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: await premiumPriceId(stripe, plan), quantity: 1 }],
    subscription_data: { metadata: { contractor_id: contractorId, plan } },
    success_url: `${site}${returnPath}?sub=success#premium`,
    cancel_url: `${site}${returnPath}?sub=cancelled#premium`,
    allow_promotion_codes: true,
  });
  return session.url!;
}

/**
 * Turned down after paying at sign-up: cancel the membership now and refund
 * everything they paid for it. Only for a contractor never approved — a
 * member who was approved and later suspended is a different conversation,
 * and nothing here touches their billing. Returns the pence refunded; throws
 * if Stripe refuses, so the caller stops rather than deleting the record of a
 * payment it could not give back.
 */
export async function refundUnapprovedPremium(contractorId: string): Promise<number> {
  const admin = createServiceRoleClient();
  const [{ data: ct }, { data: sub }] = await Promise.all([
    admin.from('contractors').select('vetted_at, business_name').eq('id', contractorId).maybeSingle(),
    admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('contractor_id', contractorId)
      .maybeSingle(),
  ]);
  if (!ct || ct.vetted_at || !sub?.stripe_customer_id) return 0;

  // By customer, not the stored subscription id: a payment can land a moment
  // before its webhook writes that id, and it must still come back.
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({ customer: sub.stripe_customer_id, status: 'all', limit: 10 });
  for (const s of subs.data) {
    if (s.status !== 'canceled' && s.status !== 'incomplete_expired') await stripe.subscriptions.cancel(s.id);
  }

  let refunded = 0;
  const invoices = await stripe.invoices.list({ customer: sub.stripe_customer_id, status: 'paid', limit: 20 });
  for (const inv of invoices.data) {
    const pi = (inv as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
    const intentId = typeof pi === 'string' ? pi : pi?.id;
    if (!intentId || !inv.amount_paid) continue;
    const existing = await stripe.refunds.list({ payment_intent: intentId, limit: 1 });
    if (existing.data.length) continue; // already refunded — a retried rejection
    await stripe.refunds.create({ payment_intent: intentId, reason: 'requested_by_customer' });
    refunded += inv.amount_paid;
  }

  await admin
    .from('subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: false, ended_at: new Date().toISOString() })
    .eq('contractor_id', contractorId);
  if (refunded) {
    await notifyAdmins(
      `Premium refunded: ${ct.business_name}`,
      `${ct.business_name} paid for premium at sign-up and was not approved. The membership is ` +
        `cancelled and £${(refunded / 100).toFixed(2)} refunded to their card.`,
    );
  }
  return refunded;
}
