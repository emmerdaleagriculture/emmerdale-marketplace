import { invoicePdf } from '@/lib/books/invoicePdf';
import type { InvoiceFull } from '@/lib/books/invoices.server';
import type { Ledger } from '@/lib/books/server';

/**
 * A made-up invoice rendered in memory, for the heartbeat: proves the PDF
 * renderer and pdfkit's fonts are in the deployed bundle. Only the fields the
 * PDF reads are filled; nothing is saved or sent.
 */
export async function renderSamplePdf(): Promise<number> {
  const inv = {
    number: 'HB-1',
    issue_date: '2026-11-20',
    due_date: '2026-11-27',
    net_pence: 10000,
    vat_pence: 2000,
    gross_pence: 12000,
    paid_pence: 0,
    notes: null,
    customer: { name: 'Heartbeat check', organisation: null, address: '1 Test Lane', vat_number: null },
    lines: [{ id: 1, description: 'Paddock topping', quantity: 1, unit_pence: 10000, net_pence: 10000, vat_code: 'STD' }],
    payments: [],
    events: [],
  } as unknown as InvoiceFull;
  const ledger = {
    trading_name: 'Heartbeat',
    legal_name: 'Heartbeat',
    address: null,
    phone: null,
    company_number: null,
    vat_number: null,
    bank_details: null,
    invoice_footer: null,
    invoice_reply_to: null,
  } as unknown as Ledger;
  const buf = await invoicePdf(inv, ledger, null);
  return buf.length;
}
