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
