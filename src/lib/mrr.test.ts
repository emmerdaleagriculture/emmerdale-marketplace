import { describe, expect, it } from 'vitest';
import { computeMrr, monthlyPence, type MrrSubscription } from './mrr';

function sub(lookup: string, amount: number, interval: 'month' | 'year', over: Partial<MrrSubscription> = {}): MrrSubscription {
  return {
    status: 'active',
    items: { data: [{ quantity: 1, price: { unit_amount: amount, currency: 'gbp', lookup_key: lookup, recurring: { interval } } }] },
    ...over,
  };
}

describe('monthlyPence', () => {
  it('counts a monthly plan as is and spreads an annual over 12 months', () => {
    expect(monthlyPence(sub('premium_monthly_2000', 2000, 'month'))).toBe(2000);
    expect(monthlyPence(sub('open_annual_39900', 39900, 'year'))).toBeCloseTo(3325, 6);
    expect(monthlyPence(sub('premium_annual_19900', 19900, 'year'))).toBeCloseTo(1658.333, 2);
  });
  it('takes a standing discount off, but not a one-off one', () => {
    const pct = { coupon: { percent_off: 50, duration: 'forever' } };
    expect(monthlyPence(sub('premium_monthly_2000', 2000, 'month', { discount: pct }))).toBe(1000);
    const once = { coupon: { percent_off: 50, duration: 'once' } };
    expect(monthlyPence(sub('premium_monthly_2000', 2000, 'month', { discount: once }))).toBe(2000);
    const off = { coupon: { amount_off: 1200, duration: 'repeating' } };
    expect(monthlyPence(sub('open_annual_39900', 39900, 'year', { discount: off }))).toBeCloseTo(3225, 6);
  });
});

describe('computeMrr', () => {
  it('counts live paying subscriptions only, by tier and plan', () => {
    const m = computeMrr([
      sub('premium_monthly_2000', 2000, 'month'),
      sub('premium_monthly_2000', 2000, 'month', { cancel_at_period_end: true }),
      sub('premium_monthly_2000', 2000, 'month', { status: 'past_due' }),
      sub('open_annual_39900', 39900, 'year'),
      sub('premium_monthly_2000', 2000, 'month', { status: 'canceled' }),
      sub('premium_monthly_2000', 2000, 'month', { status: 'incomplete' }),
      sub('premium_monthly_2000', 2000, 'month', { status: 'unpaid' }),
      sub('premium_monthly_2000', 2000, 'month', { discount: { coupon: { percent_off: 100, duration: 'forever' } } }),
    ]);
    expect(m.subscribers).toBe(4);
    expect(m.mrrPence).toBeCloseTo(3 * 2000 + 3325, 6);
    expect(m.byTier.premium).toEqual({ subscribers: 3, mrrPence: 6000 });
    expect(m.byTier.open.subscribers).toBe(1);
    expect(m.byPlan).toEqual({ monthly: 3, annual: 1 });
    expect(m.cancelling).toBe(1);
    expect(m.pastDue).toBe(1);
    expect(m.free).toBe(1);
  });
});
