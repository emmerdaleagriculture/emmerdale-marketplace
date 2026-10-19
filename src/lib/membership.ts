/**
 * A contractor's paid tier, read the one way everywhere it is shown: the
 * dashboard badge, the header bar, the menu. Mirrors contractor_tier() in SQL
 * (20261019120000).
 *
 * "Live" is an active subscription or one whose card is being retried
 * (past_due). Open outranks premium: an Open comp on top of a premium
 * subscription is Open, since Open is premium plus the customer's details.
 *
 * Client-safe: no Supabase, no server imports.
 */
export type Membership = 'premium' | 'open' | null;

type SubLike = { status: string | null; tier?: string | null } | null | undefined;
type CompLike = { premium_comped_until?: string | null; open_comped_until?: string | null };

function inFuture(until: string | null | undefined, now: number): boolean {
  return Boolean(until && new Date(until).getTime() > now);
}

export function membershipOf(sub: SubLike, contractor: CompLike, now = Date.now()): Membership {
  const live = sub?.status === 'active' || sub?.status === 'past_due';
  if ((live && sub?.tier === 'open') || inFuture(contractor.open_comped_until, now)) return 'open';
  if (live || inFuture(contractor.premium_comped_until, now)) return 'premium';
  return null;
}

/** The two tiers' prices, in pounds. Stripe's prices are looked up by tier
 *  and plan (membershipPriceId); these are what the pages print. */
export type MembershipTier = 'premium' | 'open';
export type MembershipPlan = 'monthly' | 'annual';
export const MEMBERSHIP_PRICES: Record<MembershipTier, Record<MembershipPlan, number>> = {
  premium: { monthly: 20, annual: 199 },
  open: { monthly: 49, annual: 399 },
};
export const MEMBERSHIP_NAMES: Record<MembershipTier, string> = { premium: 'Premium', open: 'Open' };

/** "£20 a month" / "£199 a year". */
export function priceLabel(tier: MembershipTier, plan: MembershipPlan): string {
  const n = MEMBERSHIP_PRICES[tier][plan];
  return plan === 'monthly' ? `£${n} a month` : `£${n} a year`;
}
/** What a year saves over twelve months. */
export function annualSaving(tier: MembershipTier): number {
  return MEMBERSHIP_PRICES[tier].monthly * 12 - MEMBERSHIP_PRICES[tier].annual;
}
/** "12 November 2026", in UK time. */
export function membershipDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
}
