import { NextResponse, type NextRequest } from 'next/server';
import { loadInvoiceByToken } from '@/lib/books/invoices.server';
import { invoiceFileName, invoicePdf } from '@/lib/books/invoicePdf';
import { invoiceLink } from '@/lib/books/invoiceEmail';

export const dynamic = 'force-dynamic';

/** The customer's PDF, by the invoice's private token. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadInvoiceByToken(token);
  if (!inv) return new NextResponse('Not found', { status: 404 });
  const pdf = await invoicePdf(inv, inv.ledger, invoiceLink(token));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceFileName(inv, inv.ledger)}"`,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}
