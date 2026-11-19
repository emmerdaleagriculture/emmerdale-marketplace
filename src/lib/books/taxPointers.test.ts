import { describe, expect, it } from 'vitest';
import { class4, corporationTax, incomeTax, ratesFor, taxYearOf } from './taxRates';
import { estimate, mtdPointer, pointers, readProfile, type TaxInput, type TbLine } from './taxPointers';

const r26 = ratesFor(2026).rates;
const P = (pounds: number) => Math.round(pounds * 100);

describe('rates', () => {
  it('picks the tax year a date falls in', () => {
    expect(taxYearOf('2026-04-05')).toBe(2025);
    expect(taxYearOf('2026-04-06')).toBe(2026);
    expect(ratesFor(2030)).toMatchObject({ exact: false });
    expect(ratesFor(2026).rates.dividend.basic).toBe(0.1075);
    expect(ratesFor(2025).rates.dividend.basic).toBe(0.0875);
  });
  it('works out income tax through the bands, with the allowance taper', () => {
    expect(incomeTax(P(12_570), r26)).toBe(0);
    expect(incomeTax(P(50_000), r26)).toBe(P(7_486));
    expect(incomeTax(P(60_000), r26)).toBe(P(11_432));
    // £110k: allowance down to £7,570.
    expect(incomeTax(P(110_000), r26)).toBe(P(33_432));
  });
  it('uses Scottish bands when asked', () => {
    expect(incomeTax(P(30_000), r26, true)).toBe(345_107);
  });
  it('works out Class 4 and corporation tax with marginal relief', () => {
    expect(class4(P(30_000), r26)).toBe(P(1_045.8));
    expect(class4(P(60_000), r26)).toBe(P(37_700 * 0.06 + 9_730 * 0.02));
    expect(corporationTax(P(40_000), r26)).toBe(P(7_600));
    expect(corporationTax(P(100_000), r26)).toBe(P(22_750));
    expect(corporationTax(P(300_000), r26)).toBe(P(75_000));
    expect(corporationTax(P(40_000), r26, 1)).toBe(P(8_725));
  });
});

const tbRow = (code: string, type: string, debit: number, credit: number, is_fixed_asset = false): TbLine => ({
  code,
  name: code,
  type,
  is_fixed_asset,
  debit_pence: debit,
  credit_pence: credit,
});

function input(over: Partial<TaxInput> = {}): TaxInput {
  return {
    profile: readProfile({}, 'sole_trader'),
    rates: r26,
    period: { from: '2026-04-06', to: '2027-04-05' },
    partYear: false,
    tb: [tbRow('4000', 'income', 0, P(60_000)), tbRow('6990', 'expense', P(10_000), 0), tbRow('0060', 'asset', P(5_000), 0, true)],
    expenseLines: [{ entry_id: 1, date: '2026-05-01', code: '6990', account: 'General', text: 'Currys · Laptop for quotes', amount: P(800) }],
    directorLoan: null,
    overdue: [],
    unpaidAtEnd: 0,
    firstSale: '2020-01-01',
    firstEntry: '2020-01-01',
    costsBeforeFirstSale: 0,
    vatRegistered: false,
    farming: true,
    turnover: P(60_000),
    ...over,
  };
}

describe('estimate', () => {
  it('takes equipment off in full and taxes a sole trader on the rest', () => {
    const e = estimate(input());
    expect(e.accountsProfit).toBe(P(50_000));
    expect(e.taxableProfit).toBe(P(45_000));
    expect(e.incomeTax).toBe(incomeTax(P(45_000), r26));
    expect(e.class4).toBe(class4(P(45_000), r26));
    expect(e.marginalRate).toBe(26); // 20% + 6%
  });
  it('taxes a partner on their share, on top of other income', () => {
    const e = estimate(input({ profile: readProfile({ structure: 'partnership', profitShare: 50, otherIncome: P(20_000) }, 'partnership') }));
    expect(e.yourProfit).toBe(P(22_500));
    expect(e.incomeTax).toBe(incomeTax(P(42_500), r26) - incomeTax(P(20_000), r26));
  });
  it('uses corporation tax for a company', () => {
    const e = estimate(input({ profile: readProfile({}, 'limited_company') }));
    expect(e.corporationTax).toBe(corporationTax(P(45_000), r26));
    expect(e.class4).toBe(0);
  });
});

describe('pointers', () => {
  const keys = (inp: TaxInput) => pointers(inp).map((p) => p.key);
  it('gives a sole trader the individual set', () => {
    const k = keys(input());
    expect(k).toEqual(expect.arrayContaining(['aia', 'kit-expensed', 'home', 'pension', 'payments-on-account', 'mtd', 'vat-pre-reg', 'farmers-averaging']));
    expect(k).not.toContain('salary');
    expect(k).not.toContain('dividends');
  });
  it('gives a company the company set, with the director’s loan risk', () => {
    const k = keys(input({ profile: readProfile({}, 'limited_company'), directorLoan: -P(4_000) }));
    expect(k).toEqual(expect.arrayContaining(['salary', 'dividends', 'dla-overdrawn', 'ct-due']));
    expect(k).not.toContain('payments-on-account');
    expect(k).not.toContain('farmers-averaging');
    const dla = pointers(input({ profile: readProfile({}, 'limited_company'), directorLoan: -P(4_000) })).find((p) => p.key === 'dla-overdrawn');
    expect(dla?.value).toBe(P(1_350));
  });
  it('values a saving by the tax it takes off, across the band', () => {
    const aia = pointers(input()).find((p) => p.key === 'aia');
    const e = estimate(input());
    const without = estimate(input({ tb: input().tb.filter((r) => r.code !== '0060') }));
    expect(aia?.value).toBe(without.total - e.total);
  });
  it('flags the 60% band', () => {
    const k = keys(input({ profile: readProfile({ otherIncome: P(70_000) }, 'sole_trader') }));
    expect(k).toContain('taper');
  });
  it('points out a loss and leaves the savings out', () => {
    const k = keys(input({ tb: [tbRow('4000', 'income', 0, P(5_000)), tbRow('6990', 'expense', P(9_000), 0)], expenseLines: [] }));
    expect(k).toContain('loss');
    expect(k).not.toContain('pension');
    expect(k).not.toContain('home');
  });
  it('skips the home pointer once it’s claimed', () => {
    const k = keys(input({ expenseLines: [{ entry_id: 2, date: '2026-06-01', code: '6990', account: 'General', text: 'Use of home', amount: P(312) }] }));
    expect(k).not.toContain('home');
  });
});

describe('pre-trading costs', () => {
  it('only shows when the books look like a start-up', () => {
    const start = { firstSale: '2026-08-01', costsBeforeFirstSale: P(2_000) };
    expect(pointers(input({ ...start, firstEntry: '2026-05-01' })).map((p) => p.key)).toContain('pre-trading');
    expect(pointers(input({ ...start, firstEntry: '2026-07-20' })).map((p) => p.key)).not.toContain('pre-trading');
  });
});

describe('Making Tax Digital', () => {
  it('names the year it starts', () => {
    expect(mtdPointer(P(15_000))).toBeNull();
    expect(mtdPointer(P(25_000))?.title).toMatch(/April 2028/);
    expect(mtdPointer(P(40_000))?.title).toMatch(/April 2027/);
    expect(mtdPointer(P(60_000))?.title).toMatch(/April 2026/);
  });
});

describe('readProfile', () => {
  it('falls back to the books’ business type and sane numbers', () => {
    expect(readProfile(null, 'limited_company').structure).toBe('limited_company');
    expect(readProfile({ structure: 'llp' }, 'sole_trader')).toMatchObject({ structure: 'llp', profitShare: 50 });
    expect(readProfile({ profitShare: 500, otherIncome: -3 }, 'sole_trader')).toMatchObject({ profitShare: 100, otherIncome: 0 });
  });
});
