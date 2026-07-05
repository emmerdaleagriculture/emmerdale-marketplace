import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Stripe client — throws if the key isn't set (paid tier not configured yet). */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — the paid tier is not configured.');
  // Pin the API version; cast avoids coupling to the SDK's version literal type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(key, { apiVersion: '2024-06-20' as any });
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
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
    .select('contractor_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!existing) return; // unknown customer — nothing to update

  // Stripe moved current_period_end from the subscription to its items in newer
  // API versions; read from items, falling back to the legacy top-level field.
  const periodEndUnix =
    sub.items?.data?.[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;

  await admin
    .from('subscriptions')
    .update({
      stripe_subscription_id: sub.id,
      status: mapStatus(sub.status),
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    })
    .eq('contractor_id', existing.contractor_id);
}
