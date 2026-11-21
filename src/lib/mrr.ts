/**
 * Monthly recurring revenue from membership subscriptions, worked out from
 * the subscriptions themselves (not from payments): what every live
 * subscription will bring in per month at its current price. Annual plans are
 * spread over twelve months (£399 a year counts as £33.25 a month), a
 * standing discount is taken off, and a member who has cancelled but whose
 * paid period hasn't ended still counts until it does.
 *
 * Pure, so it can be tested; the Stripe read is membershipMrr() in stripe.ts.
 */

export type MrrTier = 'premium' | 'open';
export type MrrPlan = 'monthly' | 'annual';

/** The parts of a Stripe subscription (API 2024-06-20) this reads. */
export type MrrSubscription = {
  status: string;
  cancel_at_period_end?: boolean | null;
  items: {
    data: {
      quantity?: number | null;
      price: {
        unit_amount: number | null;
        currency: string;
        lookup_key?: string | null;
        recurring: { interval: string; interval_count?: number | null } | null;
      };
    }[];
  };
  discount?: { coupon?: { percent_off?: number | null; amount_off?: number | null; duration?: string | null } | null } | null;
  metadata?: Record<string, string> | null;
};

export type Mrr = {
  /** Live subscriptions paying something: active or past due, discounted to nothing excluded. */
  subscribers: number;
  /** Pence per month, annuals divided by 12. Fractional pence kept until display. */
  mrrPence: number;
  byTier: Record<MrrTier, { subscribers: number; mrrPence: number }>;
  byPlan: Record<MrrPlan, number>;
  /** Of the subscribers, how many have cancelled and run out at period end. */
  cancelling: number;
  /** Of the subscribers, how many have a payment that failed. */
  pastDue: number;
  /** Live subscriptions discounted to £0 (not counted as subscribers). */
  free: number;
};

/** Active and past due count (past due is still owed and usually recovers); trials, incomplete and cancelled don't. */
const LIVE = new Set(['active', 'past_due']);

const MONTHS: Record<string, number> = { day: 12 / 365, week: 12 / 52, month: 1, year: 12 };

/** One subscription's monthly value in pence. */
export function monthlyPence(sub: MrrSubscription): number {
  let perMonth = 0;
  for (const item of sub.items.data) {
    const r = item.price.recurring;
    if (!r || item.price.currency !== 'gbp' || item.price.unit_amount == null) continue;
    const months = (MONTHS[r.interval] ?? 1) * (r.interval_count || 1);
    perMonth += (item.price.unit_amount * (item.quantity ?? 1)) / months;
  }
  // A one-off coupon has already been used up on the first invoice.
  const c = sub.discount?.coupon;
  if (c && c.duration !== 'once') {
    if (c.percent_off) perMonth *= 1 - c.percent_off / 100;
    else if (c.amount_off) {
      // amount_off comes off each invoice, so spread it over the same period.
      const r = sub.items.data[0]?.price.recurring;
      const months = r ? (MONTHS[r.interval] ?? 1) * (r.interval_count || 1) : 1;
      perMonth -= c.amount_off / months;
    }
  }
  return Math.max(0, perMonth);
}

function tierOf(sub: MrrSubscription): MrrTier {
  const key = sub.items.data[0]?.price.lookup_key ?? sub.metadata?.tier ?? '';
  return key.startsWith('open') ? 'open' : 'premium';
}

function planOf(sub: MrrSubscription): MrrPlan {
  return sub.items.data[0]?.price.recurring?.interval === 'year' ? 'annual' : 'monthly';
}

export function computeMrr(subs: MrrSubscription[]): Mrr {
  const out: Mrr = {
    subscribers: 0,
    mrrPence: 0,
    byTier: { premium: { subscribers: 0, mrrPence: 0 }, open: { subscribers: 0, mrrPence: 0 } },
    byPlan: { monthly: 0, annual: 0 },
    cancelling: 0,
    pastDue: 0,
    free: 0,
  };
  for (const sub of subs) {
    if (!LIVE.has(sub.status)) continue;
    const pence = monthlyPence(sub);
    if (pence <= 0) {
      out.free += 1;
      continue;
    }
    const tier = tierOf(sub);
    out.subscribers += 1;
    out.mrrPence += pence;
    out.byTier[tier].subscribers += 1;
    out.byTier[tier].mrrPence += pence;
    out.byPlan[planOf(sub)] += 1;
    if (sub.cancel_at_period_end) out.cancelling += 1;
    if (sub.status === 'past_due') out.pastDue += 1;
  }
  return out;
}
