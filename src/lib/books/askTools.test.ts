import { describe, expect, it } from 'vitest';
import { ASK_TOOLS, summariseLines, summariseTotals, TOOL_INPUTS, type AskLine } from './askTools';

let id = 0;
const line = (p: Partial<AskLine>): AskLine => ({
  entry_id: ++id,
  entry_date: '2026-10-01',
  account_code: '5100',
  account_name: 'Fuel',
  account_type: 'expense',
  counterparty: null,
  description: null,
  reference: null,
  memo: null,
  debit_pence: 0,
  credit_pence: 0,
  ...p,
});

const rows: AskLine[] = [
  line({ counterparty: 'Maltings Fuels', description: 'Red diesel', debit_pence: 12000, entry_date: '2026-09-10' }),
  line({ counterparty: 'Maltings Fuels', description: 'Red diesel', debit_pence: 8000, entry_date: '2026-10-02' }),
  line({ counterparty: 'Maltings Fuels', description: 'Refund', credit_pence: 1000, entry_date: '2026-10-05' }),
  line({ counterparty: 'Maltings Fuels', account_code: '1200', account_name: 'Bank', account_type: 'asset', credit_pence: 12000, entry_date: '2026-09-10' }),
  line({ counterparty: 'Mrs Field', account_code: '4000', account_name: 'Sales', account_type: 'income', credit_pence: 50000 }),
];

describe('summariseLines', () => {
  it('totals one kind of account the way it reads, refunds taken off', () => {
    const r = summariseLines(rows, { search: 'maltings', accountType: 'expense', groupBy: 'none' });
    expect(r.lines_matched).toBe(3);
    expect(r.total).toBe(190);
    expect('lines' in r && r.lines[0]).toMatchObject({ date: '2026-10-05', amount: -10 });
  });
  it('says when the total mixes account types', () => {
    const r = summariseLines(rows, { search: 'maltings', groupBy: 'none' });
    expect(r.lines_matched).toBe(4);
    expect(r.total_means).toMatch(/mixed/);
  });
  it('groups by month in date order and by name by size', () => {
    const m = summariseLines(rows, { accountType: 'expense', groupBy: 'month' });
    expect('groups' in m && m.groups).toEqual([
      { key: '2026-09', lines: 1, total: 120 },
      { key: '2026-10', lines: 2, total: 70 },
    ]);
    const c = summariseLines(rows, { groupBy: 'counterparty', accountType: 'income' });
    expect('groups' in c && c.groups).toEqual([{ key: 'Mrs Field', lines: 1, total: 500 }]);
  });
  it('caps the list and says how many were left out', () => {
    const many = Array.from({ length: 60 }, () => line({ debit_pence: 100 }));
    const r = summariseLines(many, { groupBy: 'none' });
    expect('lines' in r && r.lines.length).toBe(50);
    expect('lines' in r && r.lines_not_shown).toBe(10);
    expect(r.total).toBe(60);
  });
});

describe('summariseTotals', () => {
  it('works out profit and leaves out empty accounts', () => {
    const r = summariseTotals([
      { code: '4000', name: 'Sales', type: 'income', debit_pence: 0, credit_pence: 50000 },
      { code: '5100', name: 'Fuel', type: 'expense', debit_pence: 20000, credit_pence: 1000 },
      { code: '1200', name: 'Bank', type: 'asset', debit_pence: 50000, credit_pence: 19000 },
      { code: '5200', name: 'Repairs', type: 'expense', debit_pence: 0, credit_pence: 0 },
    ]);
    expect(r).toMatchObject({ income: 500, expenses: 190, profit: 310 });
    expect(r.accounts.map((a) => a.code)).toEqual(['4000', '5100', '1200']);
  });
});

describe('tool definitions', () => {
  it('has an input check for every tool, and strict schemas', () => {
    for (const t of ASK_TOOLS) {
      expect(TOOL_INPUTS).toHaveProperty(t.name);
      const schema = t.input_schema as unknown as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });
  it('refuses a badly shaped date', () => {
    expect(TOOL_INPUTS.account_totals.safeParse({ from: '1 Oct', to: null }).success).toBe(false);
    expect(TOOL_INPUTS.account_totals.safeParse({ from: '2026-10-01', to: null }).success).toBe(true);
  });
});
