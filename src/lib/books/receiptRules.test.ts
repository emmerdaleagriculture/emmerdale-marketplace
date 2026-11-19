import { describe, expect, it } from 'vitest';
import { blockingReasons, completeAmounts, fieldsFromRead, toPence } from './receiptRules';
import { chartFor } from './chart';
import type { AccountInfo, LedgerForPosting } from './posting';
import type { ReceiptRead } from './receiptAi';

const accounts = new Map<string, AccountInfo>(
  chartFor('sole_trader', true).map((a) => [a.code, { code: a.code, type: a.type, is_fixed_asset: Boolean(a.is_fixed_asset) }]),
);
const unregistered: LedgerForPosting = { vat_registered: false, vat_registration_date: null, vat_scheme: 'standard', base_currency: 'GBP' };
const registered: LedgerForPosting = { ...unregistered, vat_registered: true };

const read = (over: Partial<ReceiptRead> = {}): ReceiptRead => ({
  is_financial_document: true,
  document_type: 'purchase',
  counterparty_name: 'Lakeside Oils',
  counterparty_vat_number: 'gb 123 4567 89',
  billed_to_name: null,
  invoice_number: 'INV-1',
  document_date: '2026-11-01',
  currency: 'GBP',
  net_amount: 100,
  vat_amount: 5,
  gross_amount: 105,
  vat_code: 'RED',
  account_code: '5160',
  mileage_miles: null,
  description: 'Red diesel',
  confidence: 0.95,
  notes: null,
  ...over,
});

describe('receipt rules', () => {
  it('converts pounds to pence without float drift', () => {
    expect(toPence(1.005)).toBe(101);
    expect(toPence(12.5)).toBe(1250);
    expect(toPence(null)).toBeNull();
  });

  it('fills the missing amount', () => {
    expect(completeAmounts(null, 20, 120)).toEqual({ net: 100, vat: 20, gross: 120 });
    expect(completeAmounts(100, null, 120)).toEqual({ net: 100, vat: 20, gross: 120 });
    expect(completeAmounts(null, null, 50)).toEqual({ net: 50, vat: 0, gross: 50 });
  });

  it('a clear receipt has no blocking reasons', () => {
    const f = fieldsFromRead(read(), registered, accounts, '1200');
    expect(f).toMatchObject({ gross_pence: 10500, vat_pence: 500, net_pence: 10000, account_code: '5160', counterparty_vat_number: 'GB123456789' });
    expect(blockingReasons(f, read(), registered, accounts, { sameEntryExists: false })).toEqual([]);
  });

  it('low confidence, a possible duplicate and a missing category all block', () => {
    const r = read({ confidence: 0.6, account_code: '9999' });
    const f = fieldsFromRead(r, registered, accounts, '1200');
    const reasons = blockingReasons(f, r, registered, accounts, { sameEntryExists: true });
    expect(reasons.some((x) => x.includes('60% sure'))).toBe(true);
    expect(reasons.some((x) => x.includes('duplicate'))).toBe(true);
    expect(reasons.some((x) => x.includes('Choose a category'))).toBe(true);
  });

  it('a purchase can’t land in an income account; a sale always does', () => {
    expect(fieldsFromRead(read({ account_code: '4000' }), registered, accounts, '1200').account_code).toBeNull();
    const sale = fieldsFromRead(read({ document_type: 'sale', account_code: '6990' }), registered, accounts, '1200');
    expect(sale.account_code).toBe('4000');
  });

  it('an unregistered business’s sale is NOVAT', () => {
    const f = fieldsFromRead(read({ document_type: 'sale', vat_code: 'STD', account_code: '4000' }), unregistered, accounts, '1200');
    expect(f.vat_code).toBe('NOVAT');
  });

  it('not a financial document goes to review with one reason', () => {
    const r = read({ is_financial_document: false, document_type: 'other' });
    expect(blockingReasons(fieldsFromRead(r, registered, accounts, '1200'), r, registered, accounts, { sameEntryExists: false })).toHaveLength(1);
  });

  it('foreign currency blocks until converted', () => {
    const r = read({ currency: 'EUR' });
    const reasons = blockingReasons(fieldsFromRead(r, registered, accounts, '1200'), r, registered, accounts, { sameEntryExists: false });
    expect(reasons).toContain('Amounts must be in GBP.');
  });
});
