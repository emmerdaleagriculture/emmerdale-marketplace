import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { postingsFor } from './stripeSync';
import { balances } from './posting';

const t = (over: Partial<Stripe.BalanceTransaction>) =>
  ({ id: 'txn_1', object: 'balance_transaction', amount: 12000, fee: 210, currency: 'gbp', created: 1795000000, type: 'charge', description: null, source: null, ...over }) as unknown as Stripe.BalanceTransaction;
const reg = { vat_registered: true, vat_registration_date: '2020-01-01', vat_scheme: 'standard' };
const unreg = { vat_registered: false, vat_registration_date: null, vat_scheme: 'standard' };

describe('Stripe sync postings', () => {
  it('a card sale with VAT, plus the fee', () => {
    const p = postingsFor(t({}), reg);
    expect(p[0].lines).toEqual([
      { code: '1220', debit: 12000, credit: 0 },
      { code: '4000', debit: 0, credit: 10000 },
      { code: '2201', debit: 0, credit: 2000 },
    ]);
    expect(p[1].lines).toEqual([
      { code: '6800', debit: 210, credit: 0 },
      { code: '1220', debit: 0, credit: 210 },
    ]);
    expect(p.every((x) => balances(x.lines))).toBe(true);
  });
  it('an invoice payment books only the fee (the payment is already in)', () => {
    const p = postingsFor(t({ source: { id: 'ch_1', object: 'charge', metadata: { books_invoice: 'L:1' } } as unknown as Stripe.Charge }), reg);
    expect(p.map((x) => x.entry.external_id)).toEqual(['stripe-fee:txn_1']);
  });
  it('unregistered sales carry no VAT', () => {
    const p = postingsFor(t({ fee: 0 }), unreg);
    expect(p[0].lines.map((l) => l.code)).toEqual(['1220', '4000']);
    expect(p[0].entry.vat_code).toBe('NOVAT');
  });
  it('refunds, payouts and failed payouts', () => {
    const r = postingsFor(t({ type: 'refund', amount: -6000, fee: 0 }), reg)[0];
    expect(r.lines).toEqual([
      { code: '4000', debit: 5000, credit: 0 },
      { code: '2201', debit: 1000, credit: 0 },
      { code: '1220', debit: 0, credit: 6000 },
    ]);
    expect(balances(r.lines)).toBe(true);
    expect(postingsFor(t({ type: 'payout', amount: -50000, fee: 0 }), reg)[0].lines).toEqual([
      { code: '1200', debit: 50000, credit: 0 },
      { code: '1220', debit: 0, credit: 50000 },
    ]);
    expect(postingsFor(t({ type: 'payout_failure', amount: 50000, fee: 0 }), reg)[0].lines[0]).toEqual({ code: '1220', debit: 50000, credit: 0 });
  });
  it('other currencies are skipped', () => {
    expect(postingsFor(t({ currency: 'eur' }), reg)).toEqual([]);
  });
});
