import { NextResponse } from 'next/server';
import { loadBooks } from '@/lib/books/server';
import { invoicePdf } from '@/lib/books/invoicePdf';
import type { InvoiceFull } from '@/lib/books/invoices.server';

export const dynamic = 'force-dynamic';

/**
 * A made-up invoice with the contractor's real details, logo and colour, so
 * they can see their branding before sending anything. Nothing is saved.
 */
export async function GET() {
  const access = await loadBooks('/account/books/settings');
  if (!access.ledger) return new NextResponse('Not found', { status: 404 });
  const l = access.ledger;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const due = new Date(Date.now() + l.invoice_terms_days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const vat = l.vat_registered ? 'STD' : 'NOVAT';
  const lines = [
    { id: 1, description: 'Paddock topping, 4 acres', quantity: 4, unit_pence: 3500, net_pence: 14000, vat_code: vat },
    { id: 2, description: 'Harrowing', quantity: 1, unit_pence: 6000, net_pence: 6000, vat_code: vat },
  ];
  const net = 20000;
  const vatPence = l.vat_registered ? 4000 : 0;
  const inv = {
    number: 'SAMPLE',
    issue_date: today,
    due_date: due,
    net_pence: net,
    vat_pence: vatPence,
    gross_pence: net + vatPence,
    paid_pence: 0,
    notes: 'This is a sample to show how your invoices look. It hasn’t been saved or sent.',
    customer: { name: 'A. Customer', organisation: null, address: '1 Example Lane\nHampshire', vat_number: null },
    lines,
    payments: [],
    events: [],
  } as unknown as InvoiceFull;
  const pdf = await invoicePdf(inv, l, null);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Sample-invoice.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
