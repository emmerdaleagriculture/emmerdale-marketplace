import { NextResponse, type NextRequest } from 'next/server';
import { loadBooks } from '@/lib/books/server';
import { loadInvoice } from '@/lib/books/invoices.server';
import { invoiceFileName, invoicePdf } from '@/lib/books/invoicePdf';
import { invoiceLink } from '@/lib/books/invoiceEmail';

export const dynamic = 'force-dynamic';

/** The contractor's own copy of an invoice PDF. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await loadBooks(`/account/books/invoices/${id}`);
  if (!access.ledger) return new NextResponse('Not found', { status: 404 });
  const inv = await loadInvoice(access.ledger.id, Number(id));
  if (!inv || inv.status === 'draft') return new NextResponse('Not found', { status: 404 });
  const pdf = await invoicePdf(inv, access.ledger, inv.status === 'void' ? null : invoiceLink(inv.public_token));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceFileName(inv, access.ledger)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
