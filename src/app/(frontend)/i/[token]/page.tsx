import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { loadInvoiceByToken } from '@/lib/books/invoices.server';
import { recordInvoiceView, viewerId } from '@/lib/books/invoiceViews';
import { amountDue } from '@/lib/books/invoice';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import m from '../../account/market/market.module.css';
import s from './invoice.module.css';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

/**
 * A customer's invoice, opened from the link in the email. No sign-in: the
 * 24-byte token is the key. Drafts and void invoices are not found.
 */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadInvoiceByToken(token);
  if (!inv) notFound();
  const viewer = await viewerId();
  after(() => recordInvoiceView(inv, inv.ledger.contractor_id, viewer));
  const l = inv.ledger;
  const name = l.trading_name || l.legal_name;
  const due = amountDue(inv);
  const registered = inv.lines.some((x) => x.vat_code !== 'NOVAT');

  return (
    <main className={s.wrap}>
      <div className={s.card}>
        <div className={s.head}>
          <div>
            <div className={s.business}>{name}</div>
            {l.address && <div className={s.muted}>{l.address}</div>}
            {l.vat_number && <div className={s.muted}>VAT {l.vat_number}</div>}
          </div>
          <div className={s.right}>
            <div className={s.title}>Invoice {inv.number}</div>
            <div className={s.muted}>Issued {ukDate(inv.issue_date)}</div>
            <div className={s.muted}>Due {ukDate(inv.due_date)}</div>
          </div>
        </div>

        <p className={s.muted}>
          For {inv.customer.name}
          {inv.customer.organisation ? `, ${inv.customer.organisation}` : ''}
        </p>

        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th className={m.num}>Qty</th>
                <th className={m.num}>Price</th>
                <th className={m.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: 'normal' }}>{x.description}</td>
                  <td className={m.num}>{Number(x.quantity).toLocaleString('en-GB', { maximumFractionDigits: 3 })}</td>
                  <td className={m.num}>{formatPence(x.unit_pence)}</td>
                  <td className={m.num}>{formatPence(x.net_pence)}</td>
                </tr>
              ))}
              {registered && (
                <tr>
                  <td colSpan={3}>VAT</td>
                  <td className={m.num}>{formatPence(inv.vat_pence)}</td>
                </tr>
              )}
              <tr className={s.total}>
                <td colSpan={3}>Total</td>
                <td className={m.num}>{formatPence(inv.gross_pence)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={s.pay}>
          {due === 0 ? (
            <p>
              <b>Paid in full.</b> Thank you.
            </p>
          ) : (
            <>
              <p>
                <b>{formatPence(due)} to pay</b> by {ukDate(inv.due_date)}.
              </p>
              {l.bank_details && (
                <p>
                  By bank transfer: {l.bank_details}
                  <br />
                  Please use <b>{inv.number}</b> as the reference.
                </p>
              )}
            </>
          )}
          <p>
            <a className={s.link} href={`/i/${token}/pdf`}>
              Download the PDF
            </a>
          </p>
        </div>
        {inv.notes && <p>{inv.notes}</p>}
        {l.invoice_footer && <p className={s.muted}>{l.invoice_footer}</p>}
      </div>
      <p className={s.footer}>
        Sent for {name} by Emmerdale Agriculture. Questions about this invoice go to {name}
        {l.invoice_reply_to ? ` at ${l.invoice_reply_to}` : ''}.
      </p>
    </main>
  );
}
