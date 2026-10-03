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
