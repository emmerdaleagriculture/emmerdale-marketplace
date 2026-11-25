import { describe, expect, it } from 'vitest';
import { ACTION_INPUTS, ACTION_STATUS, ACTION_TOOLS, actionNote, actionView, isActionKind } from './askActions';
import { ASK_TOOLS } from './askTools';

describe('ask action tools', () => {
  it('has a tool, an input check and a status line for every change', () => {
    const names = ACTION_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(Object.keys(ACTION_INPUTS).sort());
    expect(Object.keys(ACTION_STATUS).sort()).toEqual(names);
    for (const t of ACTION_TOOLS) {
      // Strict schemas here push the request past the API's grammar size limit; inputs are checked by ACTION_INPUTS instead.
      expect(t.strict).toBeUndefined();
      expect(t.description).toContain('NOT recorded until they confirm');
    }
  });

  it('shares no name with the read tools', () => {
    const reads = new Set(ASK_TOOLS.map((t) => t.name));
    expect(ACTION_TOOLS.filter((t) => reads.has(t.name))).toEqual([]);
  });

  it('uses no nullable types: not given is an empty string or 0', () => {
    expect(JSON.stringify(ACTION_TOOLS)).not.toMatch(/"null"|anyOf/);
  });

  it('requires every property it declares, at every level', () => {
    const walk = (schema: Record<string, unknown>) => {
      if (schema.type === 'object') {
        const props = schema.properties as Record<string, Record<string, unknown>>;
        expect(schema.required).toEqual(Object.keys(props));
        expect(schema.additionalProperties).toBe(false);
        Object.values(props).forEach(walk);
      }
      if (schema.type === 'array') walk(schema.items as Record<string, unknown>);
    };
    for (const t of ACTION_TOOLS) walk(t.input_schema as unknown as Record<string, unknown>);
  });

  it('checks what the model sends', () => {
    const expense = { date: '2026-11-25', supplier: 'Shell', description: 'Diesel', total: 40, vat: 6.67, vat_code: 'STD', category_code: '5100', paid_from_code: '' };
    expect(ACTION_INPUTS.record_expense.safeParse(expense).success).toBe(true);
    expect(ACTION_INPUTS.record_expense.safeParse({ ...expense, total: -1 }).success).toBe(false);
    expect(ACTION_INPUTS.record_expense.safeParse({ ...expense, date: '25/11/2026' }).success).toBe(false);
    expect(ACTION_INPUTS.record_expense.safeParse({ ...expense, vat_code: 'PREREG' }).success).toBe(false);
    expect(ACTION_INPUTS.record_expense.safeParse({ ...expense, paid_from_code: '12' }).success).toBe(false);
    expect(ACTION_INPUTS.draft_invoice.safeParse({ customer_id: 0, new_customer_name: 'Mrs Field', new_customer_email: '', issue_date: '2026-11-25', due_date: '', notes: '', lines: [] }).success).toBe(false);
    expect(ACTION_INPUTS.record_mileage.safeParse({ date: '2026-11-25', driver: 'Tom', miles: 2001, journey: '', purpose: '' }).success).toBe(false);
    expect(isActionKind('record_expense')).toBe(true);
    expect(isActionKind('ledger_lines')).toBe(false);
    expect(isActionKind('constructor')).toBe(false);
  });
});

describe('actionView', () => {
  const row = { id: 7, kind: 'record_expense', summary: { title: 'Record an expense', lines: ['£40.00 to Shell on 25 Nov 2026', 'Category: 5100 Fuel', 'Paid from: 1200 Bank'] }, status: 'pending', result: null, error: null };

  it('reads a stored change for the page', () => {
    expect(actionView(row)).toEqual({ id: 7, kind: 'record_expense', title: 'Record an expense', lines: row.summary.lines, status: 'pending', message: null, href: null, error: null });
    expect(actionView({ ...row, status: 'done', result: { message: 'Recorded as entry #12.', href: '/account/books/journal' } })).toMatchObject({ status: 'done', message: 'Recorded as entry #12.', href: '/account/books/journal' });
  });

  it('never offers a change it cannot read as one to confirm', () => {
    expect(actionView({ ...row, status: 'weird', summary: null })).toMatchObject({ status: 'cancelled', title: 'Change to your books', lines: [] });
  });

  it('tells the model what became of a change, so a follow-up does not repeat it', () => {
    expect(actionNote(actionView(row))).toBe('- Change 7: Record an expense; £40.00 to Shell on 25 Nov 2026; Category: 5100 Fuel: still waiting for the person to confirm, not done');
    expect(actionNote(actionView({ ...row, status: 'done', result: { message: 'Recorded as entry #12.', href: null } }))).toContain('confirmed and done (Recorded as entry #12.)');
    expect(actionNote(actionView({ ...row, status: 'cancelled' }))).toContain('turned down by the person, not done');
  });
});
