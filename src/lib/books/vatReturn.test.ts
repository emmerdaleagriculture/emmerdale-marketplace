import { describe, expect, it } from 'vitest';
import { boxesFor, computeReturn, preRegCandidates, quarters, taxableTurnover, thresholdState, vatNotPosted, type VatEntry } from './vatReturn';

const e = (over: Partial<VatEntry>): VatEntry => ({
  id: 1,
  entry_date: '2026-11-01',
  kind: 'sale',
  vat_code: 'STD',
  net_pence: 10000,
  vat_pence: 2000,
  gross_pence: 12000,
  is_capital: false,
  counterparty: null,
  description: null,
  ...over,
});
const std = { vat_scheme: 'standard' as const, flat_rate_percent: null };

describe('VAT return boxes', () => {
  it('maps each kind and code to its boxes', () => {
    expect(boxesFor(e({}), std)).toEqual({ 1: 2000, 6: 10000 });
    expect(boxesFor(e({ vat_code: 'ZERO', vat_pence: 0 }), std)).toEqual({ 6: 10000 });
    expect(boxesFor(e({ vat_code: 'NOVAT' }), std)).toEqual({});
    expect(boxesFor(e({ kind: 'purchase' }), std)).toEqual({ 4: 2000, 7: 10000 });
    expect(boxesFor(e({ kind: 'purchase', vat_code: 'BLOCKED' }), std)).toEqual({ 7: 10000 });
    expect(boxesFor(e({ kind: 'purchase', vat_code: 'OUTSIDE' }), std)).toEqual({});
    expect(boxesFor(e({ kind: 'purchase', vat_code: 'RC' }), std)).toEqual({ 1: 2000, 4: 2000, 6: 10000, 7: 10000 });
    expect(boxesFor(e({ kind: 'journal', vat_code: 'PREREG', vat_pence: 5000 }), std)).toEqual({ 4: 5000 });
  });

  it('flat rate: a percentage of gross sales; input VAT only on capital of £2,000+', () => {
    const flat = { vat_scheme: 'flat_rate' as const, flat_rate_percent: 12.5 };
    expect(boxesFor(e({}), flat)).toEqual({ 1: 1500, 6: 12000 });
    expect(boxesFor(e({ kind: 'purchase' }), flat)).toEqual({ 7: 10000 });
    expect(boxesFor(e({ kind: 'purchase', is_capital: true, net_pence: 250000, vat_pence: 50000, gross_pence: 300000 }), flat)).toEqual({ 4: 50000, 7: 250000 });
  });

  it('totals, box 5, and whole pounds in boxes 6 and 7', () => {
    const r = computeReturn(
      [e({ net_pence: 10050, vat_pence: 2010, gross_pence: 12060 }), e({ id: 2, kind: 'purchase', net_pence: 5099, vat_pence: 1020, gross_pence: 6119 })],
      std,
    );
    expect(r.boxes).toEqual({ 1: 2010, 2: 0, 3: 2010, 4: 1020, 5: 990, 6: 10000, 7: 5000, 8: 0, 9: 0 });
    expect(r.detail).toHaveLength(2);
  });
});

describe('return agrees with the ledger', () => {
  it('uses the VAT actually posted, and flags entries that posted none', () => {
    const before = e({ kind: 'purchase', vat_code: 'RED', vat_pence: 2100, net_pence: 42000, gross_pence: 44100, input_vat_pence: 0, output_vat_pence: 0 });
    const after = e({ id: 2, kind: 'purchase', input_vat_pence: 2000, output_vat_pence: 0 });
    const r = computeReturn([before, after], std);
    expect(r.boxes[4]).toBe(2000);
    expect(r.boxes[7]).toBe(52000);
    expect(vatNotPosted([before, after], std).map((x) => x.id)).toEqual([1]);
  });
});

describe('quarters', () => {
  it('follows the stagger', () => {
    expect(quarters('2026-11-19', 0, 2).map((q) => [q.from, q.to])).toEqual([
      ['2026-10-01', '2026-12-31'],
      ['2026-07-01', '2026-09-30'],
    ]);
    expect(quarters('2026-11-19', 1, 1)[0]).toMatchObject({ from: '2026-11-01', to: '2027-01-31' });
    expect(quarters('2026-11-19', 2, 1)[0]).toMatchObject({ from: '2026-09-01', to: '2026-11-30' });
    expect(quarters('2026-02-10', 0, 1)[0]).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
  });
});

describe('not yet registered', () => {
  it('counts taxable turnover and flags near and over', () => {
    const t = taxableTurnover([e({ vat_code: 'NOVAT', net_pence: 7_500_000 }), e({ vat_code: 'EXEMPT', net_pence: 9_000_000 }), e({ kind: 'purchase' })]);
    expect(t).toBe(7_500_000);
    expect(thresholdState(t)).toBe('near');
    expect(thresholdState(9_000_000)).toBe('over');
    expect(thresholdState(100)).toBe('under');
  });

  it('pre-registration: goods 4 years, services 6 months, STD/RED only', () => {
    const p = (date: string, code: string, account: string, capital = false) => ({
      ...e({ kind: 'purchase', entry_date: date, vat_code: code, is_capital: capital }),
      account_code: account,
    });
    const c = preRegCandidates(
      [
        p('2023-01-01', 'STD', '0060', true), // goods, within 4 years
        p('2022-01-01', 'STD', '0060', true), // goods, over 4 years: dropped
        p('2026-06-01', 'STD', '6410'), // service within 6 months
        p('2026-01-01', 'STD', '6410'), // service too old
        p('2026-08-01', 'ZERO', '5100'), // wrong code
      ],
      '2026-09-01',
    );
    expect(c.map((x) => [x.entry_date, x.eligible])).toEqual([
      ['2023-01-01', true],
      ['2026-01-01', false],
      ['2026-06-01', true],
      ['2026-08-01', false],
    ]);
  });
});
