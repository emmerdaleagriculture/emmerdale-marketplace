import { NextResponse, type NextRequest } from 'next/server';
import { loadInvoiceByToken } from '@/lib/books/invoices.server';
import { cardPaymentsReady, invoiceCheckout } from '@/lib/books/stripeConnect';

export const dynamic = 'force-dynamic';

/** Pay by card: a Checkout session on the contractor's own Stripe account. POST only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = new URL(`/i/${token}`, req.url);
  const inv = await loadInvoiceByToken(token);
  if (!inv) return new NextResponse('Not found', { status: 404 });
  if (!cardPaymentsReady(inv.ledger) || inv.gross_pence - inv.paid_pence <= 0) return NextResponse.redirect(back, 303);
  try {
    return NextResponse.redirect(await invoiceCheckout(inv, inv.ledger), 303);
  } catch (err) {
    console.error('[books] checkout failed', { invoice: inv.id, error: err instanceof Error ? err.message : err });
    back.searchParams.set('pay', 'failed');
    return NextResponse.redirect(back, 303);
  }
}
