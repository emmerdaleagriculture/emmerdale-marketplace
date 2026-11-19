import { describe, expect, it } from 'vitest';
import { formatPence, parsePounds, roundDiv, vatInGross, vatOnNet } from './money';
import { buildPosting, balances, validateDoc, type AccountInfo, type LedgerForPosting, type PostableDoc } from './posting';
import { chartFor, personalAccountCode } from './chart';
import { buildMileagePosting, mileageAmount, taxYearOf } from './mileage';
import { accountingYear } from './period';

const accounts = new Map<string, AccountInfo>(
  chartFor('limited_company', true).map((a) => [a.code, { code: a.code, type: a.type, is_fixed_asset: Boolean(a.is_fixed_asset) }]),
);

const unregistered: LedgerForPosting = { vat_registered: false, vat_registration_date: null, vat_scheme: 'standard', base_currency: 'GBP' };
const registered: LedgerForPosting = { ...unregistered, vat_registered: true, vat_registration_date: '2026-01-01' };
const flat: LedgerForPosting = { ...registered, vat_scheme: 'flat_rate' };

const purchase = (over: Partial<PostableDoc> = {}): PostableDoc => ({
  kind: 'purchase',
  date: '2026-11-01',
  net: 1000,
  vat: 200,
  gross: 1200,
  vatCode: 'STD',
  accountCode: '6150',
  paymentCode: '1200',
  ...over,
});

describe('money', () => {
  it('rounds half up, symmetric for negatives', () => {
    expect(roundDiv(5, 10)).toBe(1);
    expect(roundDiv(4, 10)).toBe(0);
    expect(roundDiv(-5, 10)).toBe(-1);
    expect(vatOnNet(1234, 20)).toBe(247); // 246.8
    expect(vatInGross(1200, 20)).toBe(200);
    expect(vatInGross(1050, 5)).toBe(50);
  });
  it('parses pounds as typed', () => {
    expect(parsePounds('1,234.56')).toBe(123456);
    expect(parsePounds('£12')).toBe(1200);
    expect(parsePounds('12.5')).toBe(1250);
    expect(parsePounds('0.005')).toBe(1);
    expect(parsePounds('0.004')).toBe(0);
    expect(parsePounds('-3')).toBe(-300);
    expect(parsePounds('')).toBeNull();
    expect(parsePounds('abc')).toBeNull();
  });
  it('formats pence', () => {
    expect(formatPence(123456)).toBe('£1,234.56');
    expect(formatPence(-5)).toBe('−£0.05');
  });
});

describe('posting', () => {
  it('registered purchase reclaims VAT', () => {
    const p = buildPosting(purchase(), registered, accounts);
    expect(p.lines).toEqual([
      { code: '6150', debit: 1000, credit: 0 },
      { code: '2202', debit: 200, credit: 0, memo: 'Input VAT' },
      { code: '1200', debit: 0, credit: 1200 },
    ]);
    expect(balances(p.lines)).toBe(true);
  });

  it('a penny out on the document still balances', () => {
    const doc = purchase({ net: 1001, vat: 200, gross: 1200 });
    expect(validateDoc(doc, registered, accounts)).toEqual([]);
    const p = buildPosting(doc, registered, accounts);
    expect(balances(p.lines)).toBe(true);
    expect(p.lines[0].debit).toBe(1000);
  });

  it('unregistered purchase books gross but keeps the VAT on the entry', () => {
    const p = buildPosting(purchase(), unregistered, accounts);
    expect(p.lines).toEqual([
      { code: '6150', debit: 1200, credit: 0 },
      { code: '1200', debit: 0, credit: 1200 },
    ]);
    expect(p.entry.vat_pence).toBe(200);
  });

  it('before the registration date counts as unregistered', () => {
    const p = buildPosting(purchase({ date: '2025-12-31' }), registered, accounts);
    expect(p.lines).toHaveLength(2);
  });

  it('flat rate reclaims only on capital of £2,000+', () => {
    expect(buildPosting(purchase(), flat, accounts).lines).toHaveLength(2);
    const big = buildPosting(purchase({ accountCode: '0060', net: 250000, vat: 50000, gross: 300000 }), flat, accounts);
    expect(big.lines.map((l) => l.code)).toEqual(['0060', '2202', '1200']);
    expect(big.entry.is_capital).toBe(true);
  });

  it('reverse charge accounts for 20% both ways', () => {
    const p = buildPosting(purchase({ vatCode: 'RC', net: 1000, vat: 0, gross: 1000, accountCode: '6410' }), registered, accounts);
    expect(p.lines).toEqual([
      { code: '6410', debit: 1000, credit: 0 },
      { code: '2202', debit: 200, credit: 0, memo: 'Reverse charge input VAT' },
      { code: '2201', debit: 0, credit: 200, memo: 'Reverse charge output VAT' },
      { code: '1200', debit: 0, credit: 1000 },
    ]);
  });

  it('blocked VAT is not reclaimed', () => {
    const p = buildPosting(purchase({ vatCode: 'BLOCKED', accountCode: '6960' }), registered, accounts);
    expect(p.lines.map((l) => l.code)).toEqual(['6960', '1200']);
  });

  it('registered sale charges output VAT', () => {
    const p = buildPosting(purchase({ kind: 'sale', accountCode: '4000' }), registered, accounts);
    expect(p.lines).toEqual([
      { code: '1200', debit: 1200, credit: 0 },
      { code: '4000', debit: 0, credit: 1000 },
      { code: '2201', debit: 0, credit: 200, memo: 'Output VAT' },
    ]);
  });

  it('an unregistered business never charges VAT on a sale', () => {
    const p = buildPosting(purchase({ kind: 'sale', accountCode: '4000' }), unregistered, accounts);
    expect(p.entry.vat_code).toBe('NOVAT');
    expect(p.entry.vat_pence).toBe(0);
    expect(p.entry.net_pence).toBe(1200);
    expect(p.lines.find((l) => l.code === '2201')).toBeUndefined();
  });

  it('validation catches the usual mistakes', () => {
    expect(validateDoc(purchase({ gross: null }), registered, accounts)).toContain('Enter the total.');
    expect(validateDoc(purchase({ net: 900 }), registered, accounts)).toContain('Net + VAT must equal the total.');
    expect(validateDoc(purchase({ accountCode: '4000' }), registered, accounts)).toContain(
      'A purchase goes to an expense or fixed-asset account.',
    );
    expect(validateDoc(purchase({ currency: 'EUR' }), registered, accounts)).toContain('Amounts must be in GBP.');
    expect(validateDoc(purchase({ accountCode: '9999' }), registered, accounts)).toContain('Choose a category.');
  });
});

describe('chart', () => {
  it('companies get a director’s loan, sole traders capital and drawings', () => {
    const ltd = chartFor('limited_company', false).map((a) => a.code);
    const st = chartFor('sole_trader', false).map((a) => a.code);
    expect(ltd).toContain('2300');
    expect(st).not.toContain('2300');
    expect(st).toContain('3200');
    expect(personalAccountCode('sole_trader')).toBe('3000');
    expect(chartFor('sole_trader', true).map((a) => a.code)).toContain('5160');
    expect(new Set(ltd).size).toBe(ltd.length);
  });
});

describe('mileage', () => {
  it('a 10-mile claim posts £5.50 to 6330', () => {
    const p = buildMileagePosting({ date: '2026-11-01', driver: 'Tom', miles: 10, journey: 'Romsey – Andover', purpose: 'Site visit', payCode: '2300' }, 0);
    expect(p.lines).toEqual([
      { code: '6330', debit: 550, credit: 0 },
      { code: '2300', debit: 0, credit: 550 },
    ]);
    expect(p.entry.description).toBe('Mileage: 10 miles at 55p/mile (Romsey – Andover · Site visit)');
  });
  it('switches to 25p after 10,000 miles in the tax year', () => {
    expect(mileageAmount(100, 9950)).toEqual({ pence: 50 * 55 + 50 * 25, highMiles: 50, lowMiles: 50 });
    expect(mileageAmount(10, 12000).pence).toBe(250);
    expect(mileageAmount(0.5, 0).pence).toBe(28); // 27.5 → 28
  });
  it('tax years run 6 April to 5 April', () => {
    expect(taxYearOf('2026-04-05')).toEqual({ from: '2025-04-06', to: '2026-04-05' });
    expect(taxYearOf('2026-04-06')).toEqual({ from: '2026-04-06', to: '2027-04-05' });
  });
});

describe('period', () => {
  it('accounting year from a year end', () => {
    expect(accountingYear('06-30', '2026-11-19')).toEqual({ from: '2026-07-01', to: '2027-06-30' });
    expect(accountingYear('06-30', '2026-06-30')).toEqual({ from: '2025-07-01', to: '2026-06-30' });
    expect(accountingYear('06-30', '2026-11-19', -1)).toEqual({ from: '2025-07-01', to: '2026-06-30' });
    expect(accountingYear(null, '2026-11-19')).toEqual({ from: '2025-11-20', to: '2026-11-19' });
    expect(accountingYear('02-29', '2027-03-01')).toEqual({ from: '2027-03-01', to: '2028-02-29' });
  });
});

describe('review fixes', () => {
  it('rejects dates that do not exist', async () => {
    const { isIsoDate } = await import('./period');
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(validateDoc(purchase({ date: '2026-02-30' }), registered, accounts)).toContain('Enter the date.');
  });
  it('a zero-rated, exempt or outside item cannot carry VAT', () => {
    const errs = validateDoc(purchase({ kind: 'sale', accountCode: '4000', vatCode: 'ZERO' }), registered, accounts);
    expect(errs.some((e) => e.includes('no VAT'))).toBe(true);
  });
  it('only bank, owner, debtors or creditors accounts can pay', () => {
    const ltd = { ...registered, business_type: 'limited_company' as const };
    expect(validateDoc(purchase({ paymentCode: '3000' }), ltd, accounts)).toContain('Choose what it was paid from or into.');
    expect(validateDoc(purchase({ paymentCode: '2300' }), ltd, accounts)).toEqual([]);
    expect(validateDoc(purchase({ paymentCode: '2100' }), ltd, accounts)).toEqual([]);
    expect(validateDoc(purchase({ paymentCode: '4000' }), ltd, accounts)).toContain('Choose what it was paid from or into.');
  });
});
