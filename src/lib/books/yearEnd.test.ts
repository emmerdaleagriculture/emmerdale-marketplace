import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { expenseBucket, figuresFromBooks, netAssets, problems, profitBeforeTax, readFigures, reserve, toFinancials, type TbLike } from './yearEnd';
import { seal, unseal } from './secrets';
import { looksLikeKey, maskKey, isTestKey, describeError } from './tinytax';

const row = (code: string, name: string, type: string, net: number, fixed = false): TbLike => ({
  code,
  name,
  type,
  is_fixed_asset: fixed,
  debit_pence: net > 0 ? net : 0,
  credit_pence: net < 0 ? -net : 0,
});

describe('figuresFromBooks', () => {
  const year = [
    row('4000', 'Sales', 'income', -5_000_000),
    row('4900', 'Other income', 'income', -10_000),
    row('5150', 'Contractors & machinery hire', 'expense', 800_000),
    row('6800', 'Bank charges', 'expense', 20_000),
    row('6960', 'Entertainment', 'expense', 15_000),
    row('7000', 'Wages and salaries', 'expense', 1_200_000),
    row('6970', 'Staff welfare', 'expense', 5_000),
    row('8000', 'Depreciation', 'expense', 300_000),
    row('0060', 'Farm machinery & equipment', 'asset', 2_000_000, true),
    row('0050', 'Motor vehicles', 'asset', 1_500_000, true),
  ];
  const atEnd = [
    row('0060', 'Farm machinery & equipment', 'asset', 2_000_000, true),
    row('0050', 'Motor vehicles', 'asset', 1_500_000, true),
    row('0061', 'Machinery depreciation', 'asset', -300_000),
    row('1100', 'Trade debtors', 'asset', 400_000),
    row('1200', 'Business bank account', 'asset', 900_000),
    row('1210', 'Business credit card', 'liability', -50_000),
    row('2201', 'VAT on sales (output)', 'liability', -200_000),
    row('2300', "Director's loan account", 'liability', -1_000_000),
    row('3000', 'Share capital', 'equity', -10_000),
  ];

  it('sorts the year into P&L lines', () => {
    const f = figuresFromBooks(year, atEnd, [], { declarantName: 'Tom' });
    expect(f.turnover).toBe(5_000_000);
    expect(f.otherIncome).toBe(10_000);
    expect(f.costOfSales).toBe(800_000);
    expect(f.staffCosts).toBe(1_200_000);
    expect(f.depreciation).toBe(300_000);
    expect(f.otherExpenses).toBe(40_000); // bank charges + entertainment + welfare
    expect(f.disallowable).toBe(15_000);
    expect(f.capitalAllowances).toBe(2_000_000); // vans and cars aren't AIA
    expect(profitBeforeTax(f)).toBe(5_010_000 - 2_340_000);
  });

  it('builds a balance sheet that balances through the reserve', () => {
    const f = figuresFromBooks(year, atEnd, []);
    expect(f.fixedAssets).toBe(3_200_000);
    expect(f.currentAssets).toBe(1_300_000);
    expect(f.creditorsWithinYear).toBe(1_250_000);
    expect(f.shareCapital).toBe(10_000);
    expect(reserve(f)).toBe(netAssets(f) - 10_000);
    expect(f.directorLoan).toBeNull();
  });

  it('treats an overdrawn director’s loan as a debtor and asks about it', () => {
    const end = [row('1200', 'Bank', 'asset', 100_000), row('2300', "Director's loan account", 'liability', 600_000)];
    const start = [row('2300', "Director's loan account", 'liability', 100_000)];
    const f = figuresFromBooks([], end, start, { declarantName: 'Jane Smith' });
    expect(f.currentAssets).toBe(700_000);
    expect(f.directorLoan).toEqual({ name: 'Jane Smith', broughtForward: 100_000, lent: 500_000, repaidInYear: 0, repaidAfter: 0, repaidDate: null });
  });

  it('puts an overdrawn bank in creditors', () => {
    const f = figuresFromBooks([], [row('1200', 'Bank', 'asset', -25_000)], []);
    expect(f.currentAssets).toBe(0);
    expect(f.creditorsWithinYear).toBe(25_000);
  });
});

describe('expenseBucket', () => {
  it('keeps staff welfare out of staff costs', () => {
    expect(expenseBucket({ code: '6970', name: 'Staff welfare' })).toBe('otherExpenses');
    expect(expenseBucket({ code: '7010', name: "Employer's NI" })).toBe('staffCosts');
    expect(expenseBucket({ code: '8200', name: 'Corporation tax' })).toBe('taxCharge');
  });
});

describe('problems and toFinancials', () => {
  const base = figuresFromBooks([row('4000', 'Sales', 'income', -100_000)], [row('1200', 'Bank', 'asset', 100_000)], [], { declarantName: 'Tom Example' });
  const opts = { periodEnd: '2026-06-30', today: '2026-11-23', dlaOverdrawn: false };

  it('passes sensible figures', () => {
    expect(problems(base, opts)).toEqual([]);
  });

  it('refuses a missing director’s loan when the books show one', () => {
    expect(problems(base, { ...opts, dlaOverdrawn: true })[0]).toMatch(/director owes/);
  });

  it('checks the repayment window', () => {
    const f = { ...base, directorLoan: { name: 'Tom Example', broughtForward: 0, lent: 50_000, repaidInYear: 0, repaidAfter: 10_000, repaidDate: '2027-05-01' } };
    expect(problems(f, opts).join(' ')).toMatch(/nine months|future/);
  });

  it('sends pounds, and tax adjustments only on the CT600', () => {
    const ct = toFinancials(base, { forCt600: true });
    expect(ct.profit_and_loss?.turnover).toBe(1000);
    expect(ct.tax_adjustments).toBeDefined();
    expect(ct.profit_and_loss?.tax_charge).toBeUndefined();
    expect(ct.balance_sheet.profit_and_loss_account).toBe(1000);
    const acc = toFinancials(base, { forCt600: false });
    expect(acc.tax_adjustments).toBeUndefined();
    expect(acc.nil_disclosures_confirmed).toBe(true);
  });

  it('round-trips through JSON', () => {
    expect(readFigures(JSON.parse(JSON.stringify(base)))).toEqual(base);
  });
});

describe('secrets', () => {
  const k = randomBytes(32);
  it('seals and unseals for the same ledger only', () => {
    const blob = seal('{"apiKey":"x"}', 'ledger-a', k);
    expect(unseal(blob, 'ledger-a', k)).toBe('{"apiKey":"x"}');
    expect(unseal(blob, 'ledger-b', k)).toBeNull();
    expect(unseal(blob.slice(0, -2) + 'AA', 'ledger-a', k)).toBeNull();
  });
});

describe('tinytax helpers', () => {
  it('recognises and masks keys', () => {
    const key = 'tt_test_keyid_fakesecret1234';
    expect(looksLikeKey(key)).toBe(true);
    expect(isTestKey(key)).toBe(true);
    expect(maskKey(key)).toBe('tt_test_keyid_…1234');
    expect(looksLikeKey('sk_live_abc')).toBe(false);
  });
  it('describes field errors', () => {
    expect(describeError({ code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'utr', message: 'bad' }] })).toBe(
      'Request validation failed · utr: bad',
    );
  });
});

describe('tinytax client', () => {
  it('sends the key and idempotency key, and reads the envelope', async () => {
    const { tinytax } = await import('./tinytax');
    const seen: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: { filing_id: 'fil_test_x', status: 'submitted' }, request_id: 'r1' }), {
        status: 202,
        headers: { 'content-type': 'application/json', 'retry-after': '30' },
      });
    }) as unknown as typeof fetch;
    const r = await tinytax('tt_test_a_b', fake).accounts({ company_number: '00000001', period_end: '2026-06-30', credentials: { company_auth_code: 'ABC123' } }, 'idem-1');
    expect(r.ok && r.data.filing_id).toBe('fil_test_x');
    expect(r.retryAfter).toBe(30);
    expect(seen[0].url).toBe('https://tinytax.co.uk/api/v1/filings/accounts');
    const h = seen[0].init.headers as Record<string, string>;
    expect(h['X-API-Key']).toBe('tt_test_a_b');
    expect(h['Idempotency-Key']).toBe('idem-1');
  });

  it('turns an error envelope into ok: false', async () => {
    const { tinytax } = await import('./tinytax');
    const fake = (async () =>
      new Response(JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'bad', details: [{ field: 'utr', message: 'x' }] } }), {
        status: 400,
      })) as unknown as typeof fetch;
    const r = await tinytax('tt_test_a_b', fake).filing('fil_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details?.[0].field).toBe('utr');
  });
});
