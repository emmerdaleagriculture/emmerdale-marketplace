import { describe, expect, it } from 'vitest';
import { parseAmount, parseCsv, parseStatement, parseUkDate, payeeKey, type BankRow } from './bankCsv';
import { classify, isStripePayout, reconcile, rowExternalId, rowPosting, suggest, type BookLine } from './bank';
import { balances, type AccountInfo, type LedgerForPosting } from './posting';
import { chartFor } from './chart';
import { bankAccountFromRule, ruleFor, type Rule } from './rules';

describe('statement dates', () => {
  it.each([
    ['31/01/2026', '2026-01-31'],
    ['31/01/26', '2026-01-31'],
    ['31-01-2026', '2026-01-31'],
    ['31.01.2026', '2026-01-31'],
    ['2026-01-31', '2026-01-31'],
    ['2026/01/31', '2026-01-31'],
    ['31 Jan 2026', '2026-01-31'],
    ['31-Jan-2026', '2026-01-31'],
    ['31 Jan 26', '2026-01-31'],
    ['31 January 2026', '2026-01-31'],
    ['3 Sept 2026', '2026-09-03'],
    ['Jan 31, 2026', '2026-01-31'],
    ['31/01/2026 14:05', '2026-01-31'],
    ['2026-01-31T09:12:00Z', '2026-01-31'],
  ])('%s', (s, want) => expect(parseUkDate(s)).toBe(want));
  it('reads day first and rejects nonsense', () => {
    expect(parseUkDate('02/03/2026')).toBe('2026-03-02');
    expect(parseUkDate('31/02/2026')).toBeNull();
    expect(parseUkDate('13/13/2026')).toBeNull();
    expect(parseUkDate('Balance')).toBeNull();
  });
});

describe('statement amounts', () => {
  it.each([
    ['1,234.56', 123456],
    ['-12.00', -1200],
    ['£-12.00', -1200],
    ['-£12', -1200],
    ['(12.50)', -1250],
    ['12.00 CR', 1200],
    ['12.00 DR', -1200],
    ['+5', 500],
    ['�45.10', 4510],
    ['GBP 3.33', 333],
  ])('%s', (s, want) => expect(parseAmount(s)).toBe(want));
  it('blank is null, junk is NaN', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('CSV', () => {
  it('handles quotes, doubled quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
  it('detects semicolons', () => expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]));
});

describe('bank layouts', () => {
  it('Monzo: ids, name as payee, newest… order kept oldest first', () => {
    const csv = [
      'Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In',
      'tx_1,01/02/2026,09:00:00,Card payment,Screwfix,,general,-24.99,GBP,-24.99,GBP,,,,SCREWFIX DIRECT,,-24.99,',
      'tx_2,02/02/2026,10:00:00,Pot transfer,Tax pot,,savings,-100.00,GBP,-100.00,GBP,,,,POT,,-100.00,',
      'tx_3,03/02/2026,11:00:00,Faster payment,J Smith,,income,250.00,GBP,250.00,GBP,Invoice 7,,,J SMITH,,,250.00',
    ].join('\n');
    const st = parseStatement(csv);
    if ('error' in st) throw new Error(st.error);
    expect(st.rows.map((r) => [r.key, r.date, r.payee, r.amount, r.type])).toEqual([
      ['id:tx_1', '2026-02-01', 'Screwfix', -2499, 'Card payment'],
      ['id:tx_2', '2026-02-02', 'Tax pot', -10000, 'Pot transfer'],
      ['id:tx_3', '2026-02-03', 'J Smith', 25000, 'Faster payment'],
    ]);
    expect(st.rows[0].description).toBe('SCREWFIX DIRECT');
    expect(st.rows[2].description).toBe('Invoice 7');
    expect([st.start, st.end]).toEqual(['2026-02-01', '2026-02-03']);
  });

  it('Lloyds: paid in / paid out columns, newest first flipped, balances', () => {
    const csv = [
      'Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance',
      '05/03/2026,DEB,30-00-00,12345678,TESCO STORES,12.40,,987.60',
      '04/03/2026,FPI,30-00-00,12345678,ACME FARMS,,500.00,1000.00',
    ].join('\n');
    const st = parseStatement(csv);
    if ('error' in st) throw new Error(st.error);
    expect(st.rows.map((r) => [r.date, r.payee, r.amount, r.balance])).toEqual([
      ['2026-03-04', 'ACME FARMS', 50000, 100000],
      ['2026-03-05', 'TESCO STORES', -1240, 98760],
    ]);
    expect(st.opening).toBe(50000);
    expect(st.closing).toBe(98760);
    expect(st.rows[0].key).toMatch(/^h:[0-9a-f]{14}$/);
  });

  it('Nationwide: lines above the table, £ in amounts, totals skipped', () => {
    const csv = [
      '"Account Name:","FlexDirect ****1234"',
      '"Account Balance:","£1,000.00"',
      '',
      '"Date","Transaction type","Description","Paid out","Paid in","Balance"',
      '"10 Jan 2026","Visa purchase","FUEL","£45.00","","£955.00"',
      '"Total","","","£45.00","",""',
    ].join('\n');
    const st = parseStatement(csv);
    if ('error' in st) throw new Error(st.error);
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0]).toMatchObject({ date: '2026-01-10', payee: 'FUEL', amount: -4500, balance: 95500 });
    expect(st.skipped).toBe(1);
  });

  it('HSBC: no header', () => {
    const st = parseStatement('31/01/2026,COFFEE,-3.20\n31/01/2026,COFFEE,-3.20\n');
    if ('error' in st) throw new Error(st.error);
    expect(st.rows).toHaveLength(2);
    // Two identical rows on a day get different keys, the same each time the file is read.
    expect(st.rows[0].key).not.toBe(st.rows[1].key);
    const again = parseStatement('31/01/2026,COFFEE,-3.20\n31/01/2026,COFFEE,-3.20\n');
    if ('error' in again) throw new Error(again.error);
    expect(again.rows.map((r) => r.key)).toEqual(st.rows.map((r) => r.key));
  });

  it('flips a card statement that shows spending as a plus', () => {
    const st = parseStatement('Date,Description,Amount\n01/02/2026,AMAZON,12.00\n', { flip: true });
    if ('error' in st) throw new Error(st.error);
    expect(st.rows[0].amount).toBe(-1200);
  });

  it('says so when it can’t find the columns', () => {
    expect(parseStatement('hello,world\nfoo,bar')).toEqual({ error: expect.stringContaining('date and an amount') });
  });
});

const row = (date: string, amount: number, payee = 'Someone', extra: Partial<BankRow> = {}): BankRow => ({
  key: `k-${date}-${amount}-${payee}`,
  date,
  payee,
  description: '',
  amount,
  balance: null,
  type: null,
  ...extra,
});
const line = (entry_id: number, date: string, amount: number, external_id: string | null = null): BookLine => ({
  entry_id,
  date,
  amount,
  external_id,
  source: 'receipt',
  counterparty: 'X',
  description: null,
});

describe('classify', () => {
  it('imported by key, matched by amount within 5 days (nearest wins), else new', () => {
    const rows = [row('2026-02-01', -2499), row('2026-02-10', 5000), row('2026-02-10', 5000, 'Other'), row('2026-02-20', -100)];
    const lines = [
      line(1, '2026-02-01', -2499, rowExternalId('1200', rows[0].key)),
      line(2, '2026-02-06', 5000),
      line(3, '2026-02-09', 5000),
      line(4, '2026-02-10', -100),
    ];
    const { states, usedEntries } = classify(rows, '1200', lines);
    expect(states.map((s) => s.status)).toEqual(['imported', 'matched', 'matched', 'new']);
    expect(states[1]).toMatchObject({ entryId: 3 });
    expect(states[2]).toMatchObject({ entryId: 2 });
    expect([...usedEntries].sort()).toEqual([1, 2, 3]);
    const rec = reconcile(rows, states, lines, usedEntries, { start: '2026-02-01', end: '2026-02-20' });
    expect(rec).toMatchObject({ statementIn: 10000, statementOut: 2599, booksIn: 10000, booksOut: 2599, notInBooks: 1 });
    expect(rec.notOnStatement.map((l) => l.entry_id)).toEqual([4]);
  });

  it('an invoice payment booked from a row counts as imported', () => {
    const r = row('2026-02-01', 1000);
    const { states } = classify([r], '1200', [line(9, '2026-02-01', 1000, `invpay:${rowExternalId('1200', r.key)}`)]);
    expect(states[0].status).toBe('imported');
  });

  it('an entry carrying the bank’s own id (imported from another system) is that row, whatever the amount match', () => {
    const r = row('2026-02-01', -1000, 'Shop', { key: 'id:mm_abc' });
    const other = row('2026-02-01', -1000, 'Shop', { key: 'id:mm_def' });
    const { states } = classify([other, r], '1200', [line(5, '2026-02-01', -1000, 'mm_abc')]);
    expect(states.map((s) => s.status)).toEqual(['new', 'imported']);
  });
});

describe('isStripePayout', () => {
  it('money in from Stripe only', () => {
    expect(isStripePayout(row('2026-02-01', 5000, 'Stripe Payments UK Ltd'))).toBe(true);
    expect(isStripePayout(row('2026-02-01', -5000, 'Stripe Payments UK Ltd'))).toBe(false);
    expect(isStripePayout(row('2026-02-01', 5000, 'Stripey Farm'))).toBe(false);
  });
});

const ledger: LedgerForPosting = { vat_registered: true, vat_registration_date: null, vat_scheme: 'standard', base_currency: 'GBP', business_type: 'sole_trader' };
const accounts = new Map<string, AccountInfo>(
  [...chartFor('sole_trader', true), { code: '1205', name: 'Savings pots', type: 'asset' as const }].map((a) => [a.code, { code: a.code, type: a.type, is_fixed_asset: Boolean(a.is_fixed_asset) }]),
);

describe('suggest', () => {
  it('pots, an invoice’s exact amount, the payee’s history, else a flagged guess', () => {
    const rows = [
      row('2026-02-02', -10000, 'Tax pot', { type: 'Pot transfer' }),
      row('2026-02-03', 25000, 'J Smith'),
      row('2026-02-04', 25000, 'J Smith again'),
      row('2026-02-05', -2499, 'SCREWFIX 1234'),
      row('2026-02-06', -500, 'Mystery'),
    ];
    const sug = suggest(rows, rows.map(() => ({ status: 'new' as const })), {
      registered: () => true,
      history: new Map([[payeeKey('Screwfix 99'), { account: '6150', vat: 'STD' as const }]]),
      invoices: [{ id: 7, number: 'INV-7', customer: 'J Smith', due_pence: 25000, issue_date: '2026-01-20' }],
      accounts,
    });
    expect(sug.map((s) => s?.account)).toEqual(['1205', 'inv:7', '4900', '6150', '6990']);
    expect(sug[2]?.check).toBe(true);
    expect(sug[3]).toMatchObject({ vat: 'STD', check: false });
  });
});

describe('rowPosting', () => {
  it('money out to an expense: purchase with VAT from the total', () => {
    const p = rowPosting(row('2026-02-01', -1200, 'Screwfix'), { account: '6150', vat: 'STD' }, '1200', ledger, accounts, 1);
    if ('error' in p) throw new Error(p.error);
    expect(p.entry).toMatchObject({ kind: 'purchase', source: 'bank', net_pence: 1000, vat_pence: 200, gross_pence: 1200 });
    expect(p.lines).toEqual([
      { code: '6150', debit: 1000, credit: 0 },
      { code: '2202', debit: 200, credit: 0, memo: 'Input VAT' },
      { code: '1200', debit: 0, credit: 1200 },
    ]);
    expect(balances(p.lines)).toBe(true);
  });

  it('a refund in on an expense account is the purchase mirrored', () => {
    const p = rowPosting(row('2026-02-01', 1200, 'Screwfix'), { account: '6150', vat: 'STD' }, '1200', ledger, accounts, 1);
    if ('error' in p) throw new Error(p.error);
    expect(p.entry).toMatchObject({ kind: 'purchase', net_pence: -1000, vat_pence: -200, gross_pence: -1200 });
    expect(p.lines).toEqual([
      { code: '6150', debit: 0, credit: 1000 },
      { code: '2202', debit: 0, credit: 200, memo: 'Input VAT' },
      { code: '1200', debit: 1200, credit: 0 },
    ]);
  });

  it('money in to income: a sale; unregistered: no VAT', () => {
    const p = rowPosting(row('2026-02-01', 6000), { account: '4000', vat: 'STD' }, '1200', { ...ledger, vat_registered: false }, accounts, 1);
    if ('error' in p) throw new Error(p.error);
    expect(p.entry).toMatchObject({ kind: 'sale', vat_code: 'NOVAT', vat_pence: 0, gross_pence: 6000 });
    expect(p.lines).toEqual([
      { code: '1200', debit: 6000, credit: 0 },
      { code: '4000', debit: 0, credit: 6000 },
    ]);
  });

  it('a transfer to a pot or the owner is a journal outside VAT', () => {
    const p = rowPosting(row('2026-02-01', -10000), { account: '3200', vat: 'STD' }, '1200', ledger, accounts, 1);
    if ('error' in p) throw new Error(p.error);
    expect(p.entry).toMatchObject({ kind: 'journal', vat_code: 'OUTSIDE', external_id: expect.stringMatching(/^bank:1200:/) });
    expect(p.lines).toEqual([
      { code: '3200', debit: 10000, credit: 0 },
      { code: '1200', debit: 0, credit: 10000 },
    ]);
  });

  it('refuses the statement’s own account', () => {
    expect(rowPosting(row('2026-02-01', -1), { account: '1200', vat: 'STD' }, '1200', ledger, accounts, 1)).toEqual({ error: expect.any(String) });
  });
});

describe('rules', () => {
  const rules: Rule[] = [
    { id: 1, match_text: 'Lakeside Oils', direction: 'any', account_code: '5160', vat_code: 'RED', paid_from: '2100' },
    { id: 2, match_text: 'Amazon', direction: 'out', account_code: '6150', vat_code: 'STD', paid_from: null },
    { id: 3, match_text: 'Amazon Prime', direction: 'out', account_code: '6500', vat_code: null, paid_from: null },
  ];
  it('longest match wins and direction counts', () => {
    expect(ruleFor(rules, 'AMAZON PRIME*AB12', -899)?.id).toBe(3);
    expect(ruleFor(rules, 'Amazon', -899)?.id).toBe(2);
    expect(ruleFor(rules, 'Amazon refund', 899)).toBeNull();
    expect(ruleFor(rules, 'Lakeside Oils Ltd T/A Fusion Fuels')?.id).toBe(1);
    expect(ruleFor(rules, 'AMAZON.CO.UK*XY', -100)?.id).toBe(2);
    expect(ruleFor(rules, 'Amazonia Plants', -100)).toBeNull();
  });
  it('a bank payment to an on-credit supplier clears creditors; suggest uses the rule', () => {
    expect(bankAccountFromRule(rules[0], -64652)).toBe('2100');
    const rows = [row('2026-11-10', -64652, 'Lakeside Oils Ltd'), row('2026-11-11', -899, 'Amazon')];
    const states = rows.map(() => ({ status: 'new' as const }));
    const out = suggest(rows, states, { registered: () => true, history: new Map(), invoices: [], accounts, rules });
    expect(out[0]).toMatchObject({ account: '2100', vat: 'STD', check: false });
    expect(out[1]).toMatchObject({ account: '6150', vat: 'STD', why: 'Your rule: “Amazon”' });
  });
});
