import { describe, expect, it } from 'vitest';
import { amountDue, invoiceTotals, isOverdue, issuePosting, nextInvoiceNumber, paymentPosting, priceLine, voidPosting } from './invoice';
import { balances } from './posting';

const line = (over = {}) => ({ description: 'Paddock topping', quantity: 2.5, unit_pence: 4000, vat_code: 'STD', account_code: '4000', ...over });

describe('invoices', () => {
  it('prices lines, with VAT only when registered', () => {
    expect(priceLine(line(), true)).toMatchObject({ net_pence: 10000, vat_pence: 2000, vat_code: 'STD' });
    expect(priceLine(line(), false)).toMatchObject({ net_pence: 10000, vat_pence: 0, vat_code: 'NOVAT' });
    expect(priceLine(line({ quantity: 0.333, unit_pence: 100 }), true).net_pence).toBe(33);
    expect(priceLine(line({ vat_code: 'RED' }), true).vat_pence).toBe(500);
  });

  it('numbers carry on from the highest, padded to 7', () => {
    expect(nextInvoiceNumber([])).toBe('0000001');
    expect(nextInvoiceNumber(['0000271', '0000272', 'ABC-9'])).toBe('0000273');
  });

  it('issue posts debtors, income by account and output VAT', () => {
    const lines = [priceLine(line(), true), priceLine(line({ description: 'Hay', account_code: '4110', quantity: 1, unit_pence: 5000, vat_code: 'ZERO' }), true)];
    const p = issuePosting({ id: 1, ledger_id: 'L', number: '0000001', issue_date: '2026-11-19', customer_name: 'A. Customer', lines });
    expect(p.lines).toEqual([
      { code: '1100', debit: 17000, credit: 0, memo: 'Invoice 0000001' },
      { code: '4000', debit: 0, credit: 10000 },
      { code: '4110', debit: 0, credit: 5000 },
      { code: '2201', debit: 0, credit: 2000, memo: 'Output VAT' },
    ]);
    expect(balances(p.lines)).toBe(true);
    expect(p.entry.external_id).toBe('inv:L:0000001');
    expect(p.entry.vat_code).toBe('STD');
    const v = voidPosting({ id: 1, ledger_id: 'L', number: '0000001', issue_date: '2026-11-19', customer_name: 'A', lines }, p.lines, '2026-11-20');
    expect(v.lines[0]).toEqual({ code: '1100', debit: 0, credit: 17000, memo: 'Invoice 0000001' });
    expect(balances(v.lines)).toBe(true);
    expect(v.entry).toMatchObject({ kind: 'sale', vat_code: 'STD', vat_pence: -2000, net_pence: -15000 });
  });

  it('an unregistered business’s invoice posts no VAT line', () => {
    const p = issuePosting({ id: 1, ledger_id: 'L', number: '1', issue_date: '2026-11-19', customer_name: 'A', lines: [priceLine(line(), false)] });
    expect(p.lines.map((l) => l.code)).toEqual(['1100', '4000']);
    expect(p.entry.vat_code).toBe('NOVAT');
  });

  it('payments clear debtors into the right account', () => {
    const p = paymentPosting({ id: 1, number: '1', customer_name: 'A' }, { paid_on: '2026-11-20', amount_pence: 500, method: 'owner', reference: null, external_id: null }, '3000');
    expect(p.lines).toEqual([
      { code: '3000', debit: 500, credit: 0 },
      { code: '1100', debit: 0, credit: 500, memo: 'Invoice 1' },
    ]);
  });

  it('due and overdue', () => {
    expect(amountDue({ status: 'issued', gross_pence: 1000, paid_pence: 400 })).toBe(600);
    expect(amountDue({ status: 'void', gross_pence: 1000, paid_pence: 0 })).toBe(0);
    expect(isOverdue({ status: 'issued', due_date: '2026-11-01', gross_pence: 1000, paid_pence: 0 }, '2026-11-19')).toBe(true);
    expect(isOverdue({ status: 'paid', due_date: '2026-11-01', gross_pence: 1000, paid_pence: 1000 }, '2026-11-19')).toBe(false);
    expect(invoiceTotals([priceLine(line(), true)])).toEqual({ net_pence: 10000, vat_pence: 2000, gross_pence: 12000 });
  });
});
