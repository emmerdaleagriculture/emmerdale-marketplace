import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readSheet } from './importFile';
import { codeForNew, openingLines, parseTrialBalance, splitName, suggestTargets, tbAmount } from './importTb';
import { parseContacts } from './importContacts';
import { chartFor } from './chart';

const csv = (rows: string[][]) => strToU8(rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'));

/** A minimal .xlsx: shared strings, a number, an inline string and a gap in the columns. */
function xlsx(rows: (string | number)[][]): Uint8Array {
  const strings: string[] = [];
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === '') return '';
          const ref = `${col(ci)}${ri + 1}`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          strings.push(v);
          return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Trial Balance" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${body}</sheetData></worksheet>`),
    'xl/sharedStrings.xml': strToU8(`<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`),
  });
}

describe('readSheet', () => {
  it('reads an xlsx with shared strings and numbers', () => {
    const rows = readSheet(xlsx([['Trial Balance'], ['Account', 'Debit', 'Credit'], ['Sales (200)', '', 1234.5], ['Fish & Chips', 10, '']]));
    expect(rows).toEqual([['Trial Balance'], ['Account', 'Debit', 'Credit'], ['Sales (200)', '', '1234.5'], ['Fish & Chips', '10']]);
  });
  it('refuses old .xls files', () => {
    expect(readSheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toHaveProperty('error');
  });
});

describe('trial balance', () => {
  it('reads amounts', () => {
    expect(tbAmount('1,234.56')).toBe(123456);
    expect(tbAmount('(12.00)')).toBe(-1200);
    expect(tbAmount('12.00 Cr')).toBe(-1200);
    expect(tbAmount('1234.5000000001')).toBe(123450);
    expect(tbAmount('')).toBe(0);
    expect(tbAmount('abc')).toBeNaN();
  });

  it('splits Xero names', () => {
    expect(splitName('Sales (200)')).toEqual({ name: 'Sales', code: '200' });
    expect(splitName('090 - Business Bank Account')).toEqual({ name: 'Business Bank Account', code: '090' });
    expect(splitName('Repairs (general)')).toEqual({ name: 'Repairs (general)', code: null });
  });

  it('reads a Xero-style report with sections, YTD columns and totals', () => {
    const tb = parseTrialBalance([
      ['Trial Balance'],
      ['Hill Farm Contracting Ltd'],
      ['As at 31 March 2026'],
      [],
      ['Account', 'Debit', 'Credit', 'YTD Debit', 'YTD Credit'],
      ['Revenue'],
      ['Sales (200)', '', '1,000.00', '', '40,000.00'],
      ['Total Revenue', '', '1,000.00', '', '40,000.00'],
      ['Expenses'],
      ['Motor Vehicle Expenses (449)', '50.00', '', '3,000.00', ''],
      ['Assets'],
      ['Business Bank Account (090)', '', '', '27,000.00', ''],
      ['Accounts Receivable (610)', '', '', '12,000.00', ''],
      ['Liabilities'],
      ['VAT (820)', '', '', '', '2,000.00'],
      ['Equity'],
      ['Retained Earnings (960)', '', '', '', '0.00'],
      ['Total', '', '', '42,000.00', '42,000.00'],
    ]);
    if ('error' in tb) throw new Error(tb.error);
    expect(tb.asAt).toBe('2026-03-31');
    expect(tb.debits).toBe(4_200_000);
    expect(tb.credits).toBe(4_200_000);
    expect(tb.accounts.map((a) => [a.name, a.code, a.type, a.bank, a.balance])).toEqual([
      ['Sales', '200', 'income', false, -4_000_000],
      ['Motor Vehicle Expenses', '449', 'expense', false, 300_000],
      ['Business Bank Account', '090', 'asset', true, 2_700_000],
      ['Accounts Receivable', '610', 'asset', false, 1_200_000],
      ['VAT', '820', 'liability', false, -200_000],
    ]);

    const chart = chartFor('limited_company', true);
    expect(suggestTargets(tb.accounts, chart, 'limited_company')).toEqual(['4000', '6320', '1200', '1100', '2201']);
  });

  it('reads a code + type column layout with a single balance column', () => {
    const tb = parseTrialBalance([
      ['Account Code', 'Account Name', 'Account Type', 'Balance'],
      ['1001', 'Barclays Current', 'Bank', '500.00'],
      ['1002', 'Barclays Saver', 'Bank', '250.00'],
      ['0700', 'Tractor', 'Fixed Asset', '10000'],
      ['3000', 'Owner Drawings', 'Equity', '1000'],
      ['4000', 'Hedge cutting', 'Revenue', '-11750'],
    ]);
    if ('error' in tb) throw new Error(tb.error);
    const chart = chartFor('sole_trader', true);
    expect(suggestTargets(tb.accounts, chart, 'sole_trader')).toEqual(['1200', 'new:asset', '0060', '3200', 'new:income']);
    // The second bank gets a 12xx code of its own; the tractor would too, in the fixed range.
    const taken = new Set(chart.map((a) => a.code));
    expect(codeForNew('asset', tb.accounts[1], taken)).toBe('1230');
    expect(codeForNew('expense', { code: '7123', fixed: false, bank: false }, taken)).toBe('7123');
    expect(codeForNew('expense', { code: '449', fixed: false, bank: false }, taken)).toBe('7000');
  });

  it('refuses something that is not a trial balance', () => {
    expect(parseTrialBalance([['Date', 'Payee', 'Amount']])).toHaveProperty('error');
  });

  it('nets matched accounts into one line each', () => {
    expect(
      openingLines([
        { code: '1200', balance: 500 },
        { code: '1200', balance: 250 },
        { code: '4000', balance: -750 },
        { code: '6990', balance: 0 },
      ]),
    ).toEqual([
      { code: '1200', debit: 750, credit: 0 },
      { code: '4000', debit: 0, credit: 750 },
    ]);
  });
});

describe('contacts', () => {
  it('reads a Xero contacts export', () => {
    const r = parseContacts(
      readSheet(
        csv([
          ['*ContactName', 'EmailAddress', 'FirstName', 'LastName', 'POAddressLine1', 'POCity', 'POPostalCode', 'PhoneNumber', 'TaxNumber'],
          ['Meadow Stables', 'Jo@Meadow.example', 'Jo', 'Bloggs', '1 Lane', 'Romsey', 'SO51 1AA', '01794 000000', 'GB 123 4567 89'],
          ['', '', '', '', '', '', '', '', ''],
        ]),
      ) as string[][],
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.customers).toEqual([
      { name: 'Meadow Stables', organisation: null, email: 'jo@meadow.example', phone: '01794 000000', address: '1 Lane\nRomsey\nSO51 1AA', vat_number: 'GB123456789' },
    ]);
  });

  it('reads a FreshBooks clients export', () => {
    const r = parseContacts([
      ['Organization', 'First Name', 'Last Name', 'Email', 'Business Phone', 'Address Line 1', 'City', 'Postal Code', 'Country'],
      ['Oak Farm', 'Sam', 'Smith', 'sam@oak.example', '', 'Oak Lane', 'Andover', 'SP10 1AA', 'United Kingdom'],
      ['', 'Pat', 'Jones', 'not-an-email', '07700 900000', '', '', '', ''],
    ]);
    if ('error' in r) throw new Error(r.error);
    expect(r.customers.map((c) => [c.name, c.organisation, c.email, c.address])).toEqual([
      ['Oak Farm', null, 'sam@oak.example', 'Oak Lane\nAndover\nSP10 1AA\nUnited Kingdom'],
      ['Pat Jones', null, null, null],
    ]);
  });
});
