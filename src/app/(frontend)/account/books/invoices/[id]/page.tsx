import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLedger } from '@/lib/books/server';
import { loadInvoice } from '@/lib/books/invoices.server';
import { invoiceLink } from '@/lib/books/invoiceEmail';
import { amountDue, isOverdue, PAYMENT_METHODS, type PaymentMethod } from '@/lib/books/invoice';
import { formatPence } from '@/lib/books/money';
import { todayUk, ukDate } from '@/lib/books/period';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { BooksFrame } from '../../BooksFrame';
import { InvoiceActions } from './InvoiceActions';

export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

const EVENT: Record<string, string> = {
  sent: 'Emailed',
  delivered: 'Delivered',
  bounced: 'Bounced: the address didn’t accept it',
  spam: 'Marked as spam',
  failed: 'Couldn’t be sent',
  viewed: 'Customer opened the invoice link',
  paid: 'Paid',
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

const DONE: Record<string, string> = { issued: 'Invoice issued and posted to your books.', paid: 'Payment recorded.', voided: 'Invoice voided: its sale is reversed in your books.' };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id: raw } = await params;
  const { done } = await searchParams;
  const access = await loadLedger(`/account/books/invoices/${raw}`);
  const inv = await loadInvoice(access.ledger.id, Number(raw));
  if (!inv) notFound();
  const today = todayUk();
  const due = amountDue(inv);
  const overdue = isOverdue(inv, today);
  const registered = inv.lines.some((l) => l.vat_code !== 'NOVAT');

  return (
    <BooksFrame access={access} title={`Invoice ${inv.number}`} tab="invoices" crumb={`Invoice ${inv.number}`}>
      {done && DONE[done] && <p className={s.notice}>{DONE[done]}</p>}
      {access.canEdit && !access.ledger.stripe_charges_enabled && inv.status !== 'void' && inv.status !== 'paid' && (
        <p className={s.readOnly}>
          Customers can’t pay this by card yet.{' '}
          <Link href="/account/books/stripe">Connect Stripe to add a Pay by card button →</Link>
        </p>
      )}
      <p className={m.sub}>
        <b>{overdue ? 'Overdue' : inv.status[0].toUpperCase() + inv.status.slice(1)}</b> ·{' '}
        <Link className={s.link} href={`/account/books/customers/${inv.customer.id}`}>
          {inv.customer.organisation || inv.customer.name}
        </Link>{' '}
        · issued {ukDate(inv.issue_date)} · due {ukDate(inv.due_date)}
        {inv.status !== 'draft' && (
          <>
            {' '}
            ·{' '}
            <a className={s.link} href={`/account/books/invoices/${inv.id}/pdf`}>
              PDF
            </a>
          </>
        )}
        {inv.status === 'draft' && access.canEdit && (
          <>
            {' '}
            ·{' '}
            <Link className={s.link} href={`/account/books/invoices/${inv.id}/edit`}>
              Edit
            </Link>
          </>
        )}
      </p>

      {access.canEdit && (
        <InvoiceActions invoiceId={inv.id} status={inv.status} customerEmail={inv.customer.email} due={due} sentBefore={Boolean(inv.sent_at)} today={today} />
      )}

      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th>Description</th>
              <th className={m.num}>Qty</th>
              <th className={m.num}>Price</th>
              {registered && <th>VAT</th>}
              <th className={m.num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'normal' }}>{l.description}</td>
                <td className={m.num}>{Number(l.quantity).toLocaleString('en-GB', { maximumFractionDigits: 3 })}</td>
                <td className={m.num}>{formatPence(l.unit_pence)}</td>
                {registered && <td>{l.vat_code}</td>}
                <td className={m.num}>{formatPence(l.net_pence)}</td>
              </tr>
            ))}
            {registered && (
              <tr>
                <td colSpan={4}>VAT</td>
                <td className={m.num}>{formatPence(inv.vat_pence)}</td>
              </tr>
            )}
            <tr className={s.totalRow}>
              <td colSpan={registered ? 4 : 3}>Total</td>
              <td className={m.num}>{formatPence(inv.gross_pence)}</td>
            </tr>
            {inv.paid_pence > 0 && (
              <tr className={s.totalRow}>
                <td colSpan={registered ? 4 : 3}>Still due</td>
                <td className={m.num}>{formatPence(due)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {inv.notes && <p className={m.sub} style={{ marginTop: 12 }}>{inv.notes}</p>}

      {inv.payments.length > 0 && (
        <>
          <h2 className={m.h2}>Payments</h2>
          <ul className={m.sub}>
            {inv.payments.map((p) => (
              <li key={p.id}>
                {ukDate(p.paid_on)}: {formatPence(p.amount_pence)} by {PAYMENT_METHODS[p.method as PaymentMethod]?.label.toLowerCase() ?? p.method}
                {p.reference ? ` (${p.reference})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {inv.status !== 'draft' && (
        <>
          <h2 className={m.h2}>Delivery</h2>
          {inv.events.length === 0 ? (
            <p className={m.sub}>Not emailed yet.</p>
          ) : (
            <ul className={m.sub}>
              {inv.events.map((e) => (
                <li key={e.id}>
                  {fmtTime(e.at)}: {EVENT[e.kind] ?? e.kind}
                  {e.recipient && e.kind === 'sent' ? ` to ${e.recipient}` : ''}
                </li>
              ))}
            </ul>
          )}
          {inv.status !== 'void' && (
            <p className={m.fine}>
              The customer’s link, if you want to send it yourself:{' '}
              <span style={{ overflowWrap: 'anywhere' }}>{invoiceLink(inv.public_token)}</span>
            </p>
          )}
        </>
      )}
      <p className={m.fine}>
        <Link className={s.link} href="/account/books/invoices">
          ← All invoices
        </Link>
      </p>
    </BooksFrame>
  );
}
