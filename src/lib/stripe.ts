import Stripe from 'stripe';
import { unstable_cache } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { revalidateDirectory } from '@/lib/directory';

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
 * Memberships. The prices live in Stripe under these lookup keys and are
 * created on first use, so there is nothing to set up by hand and no price
 * id to keep in an env var. Changing an amount means a new lookup key: a
 * Stripe price is immutable, and existing subscribers stay on the old one.
 *
 * Two tiers, one product each. Premium (£20/£199): first refusal and 5%.
 * Open (£49/£399): the same, plus the customer's contact details on every
 * invitation, to deal with them directly. A contractor holds one
 * subscription; switching tier swaps the price on it (changeMembershipTier).
 */
export const MEMBERSHIP_PLANS = {
  premium: {
    product: 'Premium membership',
    monthly: { lookupKey: 'premium_monthly_2000', amountPence: 2000, interval: 'month' },
    annual: { lookupKey: 'premium_annual_19900', amountPence: 19900, interval: 'year' },
  },
  open: {
    product: 'Open membership',
    monthly: { lookupKey: 'open_monthly_4900', amountPence: 4900, interval: 'month' },
    annual: { lookupKey: 'open_annual_39900', amountPence: 39900, interval: 'year' },
  },
} as const;
export type MembershipTier = keyof typeof MEMBERSHIP_PLANS;
export type PremiumPlan = 'monthly' | 'annual';
/** The premium tier's plans, for callers that predate tiers. */
export const PREMIUM_PLANS = {
  monthly: MEMBERSHIP_PLANS.premium.monthly,
  annual: MEMBERSHIP_PLANS.premium.annual,
} as const;

export function isMembershipTier(s: unknown): s is MembershipTier {
  return s === 'premium' || s === 'open';
}

/** The tier a Stripe price belongs to, by its lookup key; premium when unsure. */
export function tierOfLookupKey(key: string | null | undefined): MembershipTier {
  return key?.startsWith('open_') ? 'open' : 'premium';
}

export async function membershipPriceId(
  stripe: Stripe,
  tier: MembershipTier,
  plan: PremiumPlan,
): Promise<string> {
  const plans = MEMBERSHIP_PLANS[tier];
  const keys = [plans.monthly.lookupKey, plans.annual.lookupKey];
  const { data } = await stripe.prices.list({ lookup_keys: keys, active: true, limit: 10 });
  const want = plans[plan];
  const found = data.find((p) => p.lookup_key === want.lookupKey);
  if (found) return found.id;
  // Both plans of a tier under one product, so Stripe reports them as one thing.
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
    ...(product ? { product } : { product_data: { name: plans.product } }),
  });
  return price.id;
}

export async function premiumPriceId(stripe: Stripe, plan: PremiumPlan): Promise<string> {
  return membershipPriceId(stripe, 'premium', plan);
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
    .select('contractor_id, status, tier')
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
  // The lookup key is the truth about which tier they are paying for; the
  // metadata written at Checkout is the fallback for a price made by hand.
  const tier = tierOfLookupKey(
    sub.items?.data?.[0]?.price?.lookup_key ?? (sub.metadata?.tier as string | undefined),
  );

  const { error } = await admin
    .from('subscriptions')
    .update({
      stripe_subscription_id: sub.id,
      status,
      tier,
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
      `New ${tier} member: ${ct?.business_name ?? existing.contractor_id}`,
      `${ct?.business_name ?? 'A contractor'} has started a ${interval === 'year' ? 'yearly' : 'monthly'} ` +
        `${tier} membership.` +
        (tier === 'open'
          ? ' As an Open member they see customer contact details on every job they are invited to.'
          : '') +
        `\n\n${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/contractors/${existing.contractor_id}`,
    );
  }
  // An Open membership starting or ending is a listing appearing or going.
  // Only when something moved: this also runs for every member in the
  // nightly sweep (premium-sync) and on every renewal webhook, and each call
  // marks every county page stale.
  if (status !== existing.status || tier !== existing.tier) revalidateDirectory();
}

/**
 * A Checkout session for a membership plan, for this contractor. Reuses (or
 * creates) their Stripe customer. Shared by the dashboard buttons and the
 * choice at the end of onboarding.
 */
export async function premiumCheckoutUrl(
  contractorId: string,
  plan: PremiumPlan,
  returnPath: MembershipReturnPath = '/account',
  tier: MembershipTier = 'premium',
): Promise<string> {
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
    line_items: [{ price: await membershipPriceId(stripe, tier, plan), quantity: 1 }],
    subscription_data: { metadata: { contractor_id: contractorId, plan, tier } },
    success_url: membershipReturnUrl(returnPath, 'success'),
    cancel_url: membershipReturnUrl(returnPath, 'cancelled'),
    allow_promotion_codes: true,
  });
  return session.url!;
}

/**
 * Where a membership button sends the contractor back to afterwards. The
 * form says which page it was on; anything else — a forged value, a
 * missing field — is the membership page, so a redirect can never leave
 * the site. The dashboard is still a return: onboarding sends new
 * applicants back to it (its review banner is there), and Checkout sessions
 * made before its buttons moved to /account/membership land on it too.
 */
export const MEMBERSHIP_RETURN_PATHS = ['/account', '/account/membership'] as const;
export type MembershipReturnPath = (typeof MEMBERSHIP_RETURN_PATHS)[number];
export function membershipReturnPath(value: unknown): MembershipReturnPath {
  return MEMBERSHIP_RETURN_PATHS.find((p) => p === value) ?? '/account/membership';
}

/**
 * The URL to send them back to, with what happened in ?sub=. On the
 * dashboard the membership card is part-way down, so the fragment scrolls
 * to it; the membership page is the panel, and has no #premium.
 */
export function membershipReturnUrl(back: MembershipReturnPath, notice?: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const query = notice ? `?sub=${notice}` : '';
  return `${site}${back}${query}${back === '/account' ? '#premium' : ''}`;
}

/**
 * Move a live membership to another tier or plan: the price on the Stripe
 * subscription is swapped, prorated from today, and the row re-read. Used
 * for premium → Open (and back) from the dashboard, so a member never holds
 * two subscriptions. Returns false when there is nothing live to change —
 * the caller then starts a Checkout instead.
 */
export async function changeMembershipTier(
  contractorId: string,
  tier: MembershipTier,
  plan: PremiumPlan,
): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('contractor_id', contractorId)
    .maybeSingle();
  if (!row?.stripe_customer_id || (row.status !== 'active' && row.status !== 'past_due')) return false;

  const stripe = getStripe();
  // By customer rather than the stored id, as refundUnapprovedPremium does:
  // the live one is what gets changed, whatever the row last recorded.
  const subs = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 10 });
  const live = subs.data.find((s) => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status));
  if (!live) return false;
  const item = live.items.data[0];
  if (!item) return false;
  const priceId = await membershipPriceId(stripe, tier, plan);
  if (item.price.id === priceId) return true; // already on it
  const updated = await stripe.subscriptions.update(live.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: 'create_prorations',
    cancel_at_period_end: false,
    metadata: { ...live.metadata, tier, plan },
  });
  await syncSubscription(updated);
  const { data: ct } = await admin.from('contractors').select('business_name').eq('id', contractorId).maybeSingle();
  await notifyAdmins(
    `Membership changed to ${tier}: ${ct?.business_name ?? contractorId}`,
    `${ct?.business_name ?? 'A contractor'} moved their membership to ${tier} (${plan}).` +
      (tier === 'open'
        ? ' As an Open member they now see customer contact details on every job they are invited to.'
        : ' They no longer see customer contact details before a job is booked.') +
      `\n\n${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/contractors/${contractorId}`,
  );
  return true;
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

/** What memberships have brought in, all time, read from Stripe. */
export type MembershipRevenue = {
  /** Every successful membership charge, before refunds and disputes. */
  grossPence: number;
  /** Refunded back to members: turned-down applicants, goodwill. */
  refundedPence: number;
  /** Taken back by the card issuer: disputes we lost. */
  disputedPence: number;
  /** Gross less refunds and lost disputes: what we have actually kept. */
  netPence: number;
  /** Charges that succeeded (a refunded one still counts as a payment). */
  payments: number;
  /** Distinct Stripe customers whose payments we still hold any of. */
  members: number;
  /** Net, by the tier each charge was for. */
  byTier: Record<MembershipTier, number>;
  /** When the first membership payment landed, ISO; null until one has. */
  firstPaidAt: string | null;
};

/**
 * Cumulative membership revenue. Nothing in our database records a
 * subscription payment — the webhook and the nightly sync only track whether
 * a membership is live — so the figure comes from Stripe's charges: every
 * successful charge raised by a subscription invoice, less what was refunded
 * and what a lost dispute took back. Job deposits and balances are Checkout
 * payments with no invoice and are left out. The invoice is on the charge
 * whether or not we still hold the contractor's row, so a deleted account's
 * payments still count.
 *
 * Cached for ten minutes: the read walks every charge on the account (a few
 * hundred a year at today's volume), and an all-time figure does not need
 * to be live. Null when Stripe is not configured; throws when Stripe or the
 * database does not answer, so the caller shows that rather than a zero.
 */
export const membershipRevenue = unstable_cache(loadMembershipRevenue, ['membership-revenue'], {
  revalidate: 600,
});

async function loadMembershipRevenue(): Promise<MembershipRevenue | null> {
  if (!stripeConfigured()) return null;
  const admin = createServiceRoleClient();
  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('stripe_customer_id, tier')
    .not('stripe_customer_id', 'is', null);
  if (error) throw new Error(`subscriptions: ${error.message}`);
  // Only a fallback for the tier: a charge is a membership by its invoice.
  const tierByCustomer = new Map<string, MembershipTier>();
  for (const s of subs ?? []) {
    if (s.stripe_customer_id) tierByCustomer.set(s.stripe_customer_id, isMembershipTier(s.tier) ? s.tier : 'premium');
  }

  const stripe = getStripe();
  // The invoice comes expanded so the tier can be read off the price the
  // charge was for, not the tier the member holds today; the dispute, so a
  // lost one can be taken off. Bounded, so a slow Stripe cannot hold the
  // admin page for the SDK's default 80 seconds a page.
  const charges = await stripe.charges
    .list({ limit: 100, expand: ['data.invoice', 'data.dispute'] }, { timeout: 20_000, maxNetworkRetries: 1 })
    .autoPagingToArray({ limit: 5000 });

  const out: MembershipRevenue = {
    grossPence: 0,
    refundedPence: 0,
    disputedPence: 0,
    netPence: 0,
    payments: 0,
    members: 0,
    byTier: { premium: 0, open: 0 },
    firstPaidAt: null,
  };
  const heldByCustomer = new Map<string, number>();
  for (const c of charges) {
    if (!c.paid || c.status !== 'succeeded' || c.currency !== 'gbp') continue;
    // `invoice` sits on the charge under the API version pinned in getStripe;
    // the SDK's own types follow a later version that moved it, hence the cast.
    const invoice = (c as unknown as { invoice?: string | InvoiceShape | null }).invoice ?? null;
    if (invoice == null) continue;

    const customerId = typeof c.customer === 'string' ? c.customer : (c.customer?.id ?? null);
    // Same cast as the invoice: `dispute` is on the charge under the pinned
    // API version. Only a lost one is money gone; open and won are not.
    const dispute = (c as unknown as { dispute?: string | { status?: string } | null }).dispute ?? null;
    const lost = dispute && typeof dispute !== 'string' && dispute.status === 'lost' ? c.amount - c.amount_refunded : 0;
    const net = c.amount - c.amount_refunded - lost;
    out.grossPence += c.amount;
    out.refundedPence += c.amount_refunded;
    out.disputedPence += lost;
    out.netPence += net;
    out.payments += 1;
    if (customerId) heldByCustomer.set(customerId, (heldByCustomer.get(customerId) ?? 0) + net);
    out.byTier[chargeTier(invoice, customerId ? tierByCustomer.get(customerId) : undefined)] += net;
    const at = new Date(c.created * 1000).toISOString();
    if (!out.firstPaidAt || at < out.firstPaidAt) out.firstPaidAt = at;
  }
  // A turned-down applicant, paid and refunded in full, is not a member.
  out.members = [...heldByCustomer.values()].filter((n) => n > 0).length;
  return out;
}

/** The parts of an expanded invoice the tier can be read from, either API shape. */
type InvoiceShape = {
  lines?: { data?: { amount?: number; price?: { lookup_key?: string | null } | null }[] };
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
};

/**
 * Which tier a charge paid for: the price on the line that carried the
 * money, then the tier stamped on the subscription at checkout, then the
 * member's current tier. The largest positive line, not the first: a tier
 * change is invoiced with a credit for the old price ahead of the charge for
 * the new one (changeMembershipTier prorates), and the credit line names the
 * tier they left.
 */
function chargeTier(invoice: string | InvoiceShape | null, fallback: MembershipTier | undefined): MembershipTier {
  if (invoice && typeof invoice !== 'string') {
    const paid = (invoice.lines?.data ?? [])
      .filter((l) => l.price?.lookup_key && (l.amount ?? 0) > 0)
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
    if (paid?.price?.lookup_key) return tierOfLookupKey(paid.price.lookup_key);
    const meta = invoice.subscription_details?.metadata?.tier ?? invoice.parent?.subscription_details?.metadata?.tier;
    if (isMembershipTier(meta)) return meta;
  }
  return fallback ?? 'premium';
}
