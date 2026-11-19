import { describe, expect, it } from 'vitest';
import { bookedFrom, marketplacePostings, type MarketJob } from './marketplace';
import { balances, type AccountInfo, type LedgerForPosting } from './posting';
import { chartFor } from './chart';

const accounts = new Map<string, AccountInfo>(chartFor('limited_company', true).map((a) => [a.code, { code: a.code, type: a.type, is_fixed_asset: Boolean(a.is_fixed_asset) }]));
const unreg: LedgerForPosting = { vat_registered: false, vat_registration_date: null, vat_scheme: 'standard', base_currency: 'GBP', business_type: 'limited_company' };
const reg: LedgerForPosting = { ...unreg, vat_registered: true };
const job = (id: string, date: string, price: number): MarketJob => ({ id, date, price_pence: price, service: 'Paddock topping', postcode: 'SO51 6AA' });

describe('marketplace postings', () => {
  it('a signed-off job is a sale to Emmerdale on account; the payout clears it', () => {
    const ps = marketplacePostings([job('aaaaaaaa-1', '2026-11-10', 30000)], [{ id: 'p1', submission_id: 'aaaaaaaa-1', amount_pence: 30000, paid_on: '2026-11-14' }], new Map(), new Set(), unreg, accounts, '1200', '2026-11-01');
    expect(ps).toHaveLength(2);
    expect(ps[0].entry).toMatchObject({ kind: 'sale', source: 'marketplace', counterparty: 'Emmerdale Agriculture Online Ltd', vat_code: 'NOVAT', gross_pence: 30000, external_id: 'mkt-sale:aaaaaaaa-1', reference: 'EA-AAAAAAAA' });
    expect(ps[0].entry.description).toBe('Marketplace job: Paddock topping, SO51');
    expect(ps[0].lines).toEqual([
      { code: '1100', debit: 30000, credit: 0 },
      { code: '4000', debit: 0, credit: 30000 },
    ]);
    expect(ps[1].entry).toMatchObject({ kind: 'journal', entry_date: '2026-11-14', external_id: 'mkt-payout:p1' });
    expect(ps[1].lines).toEqual([
      { code: '1200', debit: 30000, credit: 0 },
      { code: '1100', debit: 0, credit: 30000, memo: 'Job EA-AAAAAAAA' },
    ]);
    ps.forEach((p) => expect(balances(p.lines)).toBe(true));
  });

  it('registered: the VAT is inside the price', () => {
    const [p] = marketplacePostings([job('j', '2026-11-10', 36000)], [], new Map(), new Set(), reg, accounts, '1200', '2026-01-01');
    expect(p.entry).toMatchObject({ vat_code: 'STD', net_pence: 30000, vat_pence: 6000 });
    expect(p.lines).toContainEqual({ code: '2201', debit: 0, credit: 6000, memo: 'Output VAT' });
  });

  it('nothing before the start date, and a payout for an unbooked job waits', () => {
    const ps = marketplacePostings([job('old', '2026-10-01', 1000)], [{ id: 'p', submission_id: 'old', amount_pence: 1000, paid_on: '2026-11-02' }], new Map(), new Set(), unreg, accounts, '1200', '2026-11-01');
    expect(ps).toEqual([]);
  });

  it('re-running posts nothing; a later price change posts the difference', () => {
    const { booked, payouts } = bookedFrom([
      { external_id: 'mkt-sale:j', gross_pence: 30000 },
      { external_id: 'mkt-payout:p1', gross_pence: 30000 },
    ]);
    const po = [{ id: 'p1', submission_id: 'j', amount_pence: 30000, paid_on: '2026-11-14' }];
    expect(marketplacePostings([job('j', '2026-11-10', 30000)], po, booked, payouts, unreg, accounts, '1200', '2026-11-01')).toEqual([]);

    const [down] = marketplacePostings([job('j', '2026-11-10', 25000)], po, booked, payouts, unreg, accounts, '1200', '2026-11-01');
    expect(down.entry).toMatchObject({ external_id: 'mkt-adj:j:1', gross_pence: -5000 });
    expect(down.lines).toEqual([
      { code: '1100', debit: 0, credit: 5000 },
      { code: '4000', debit: 5000, credit: 0 },
    ]);
    const again = bookedFrom([
      { external_id: 'mkt-sale:j', gross_pence: 30000 },
      { external_id: 'mkt-adj:j:1', gross_pence: -5000 },
    ]);
    expect(again.booked.get('j')).toEqual({ total: 25000, adjustments: 1 });
    const [up] = marketplacePostings([job('j', '2026-11-10', 30000)], [], again.booked, again.payouts, unreg, accounts, '1200', '2026-11-01');
    expect(up.entry).toMatchObject({ external_id: 'mkt-adj:j:2', gross_pence: 5000 });
  });
});
