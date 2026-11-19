import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import { amountDue, isOverdue } from '@/lib/books/invoice';
import { formatPence } from '@/lib/books/money';
import { todayUk, ukDate } from '@/lib/books/period';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import kit from '@/components/app/appKit.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';

export const metadata: Metadata = { title: 'Invoices', robots: { index: false, follow: false } };

const FILTERS = { open: ['draft', 'issued'], paid: ['paid'], void: ['void'], all: ['draft', 'issued', 'paid', 'void'] } as const;
type Filter = keyof typeof FILTERS;

const EMAIL_LABEL: Record<string, string> = { sent: 'Sent', delivered: 'Delivered', viewed: 'Opened the link', bounced: 'Bounced', spam: 'Marked as spam', failed: 'Failed' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const access = await loadLedger('/account/books/invoices');
  const { show } = await searchParams;
  const filter: Filter = show && show in FILTERS ? (show as Filter) : 'open';
  const admin = createServiceRoleClient();
  const [{ data: invoices }, { data: owed }] = await Promise.all([
    admin
      .from('books_invoices')
      .select('id, number, status, issue_date, due_date, gross_pence, paid_pence, books_customers(name, organisation), books_invoice_events(kind, at)')
      .eq('ledger_id', access.ledger.id)
      .in('status', [...FILTERS[filter]])
      .order('issue_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(500),
    admin.from('books_invoices').select('status, due_date, gross_pence, paid_pence').eq('ledger_id', access.ledger.id).eq('status', 'issued').limit(5000),
  ]);
  const today = todayUk();
  const totalOwed = (owed ?? []).reduce((t, i) => t + amountDue(i), 0);
  const totalOverdue = (owed ?? []).filter((i) => isOverdue(i, today)).reduce((t, i) => t + amountDue(i), 0);

  return (
    <BooksFrame access={access} title="Invoices" tab="invoices" crumb="Invoices">
      <div className={kit.tiles}>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>Owed to you</div>
          <div className={kit.tileValue}>{formatPence(totalOwed)}</div>
        </div>
        <div className={kit.tile}>
          <div className={kit.tileLabel}>Overdue</div>
          <div className={kit.tileValue}>{formatPence(totalOverdue)}</div>
        </div>
      </div>
      <div className={s.actions}>
        {access.canEdit && (
          <Link className={f.btnPrimary} href="/account/books/invoices/new">
            New invoice
          </Link>
        )}
        <Link className={f.btnGhost} href="/account/books/customers">
          Customers
        </Link>
        {access.canEdit && (
          <Link className={f.btnGhost} href="/account/books/settings#card-payments">
            {access.ledger.stripe_charges_enabled ? 'Card payments: on' : 'Take card payments'}
          </Link>
        )}
      </div>
      <nav className={s.nav} aria-label="Show invoices">
        {(Object.keys(FILTERS) as Filter[]).map((k) => (
          <Link key={k} href={`/account/books/invoices?show=${k}`} aria-current={filter === k ? 'page' : undefined}>
            {k === 'open' ? 'Open' : k === 'paid' ? 'Paid' : k === 'void' ? 'Void' : 'All'}
          </Link>
        ))}
      </nav>
      {(invoices ?? []).length === 0 ? (
        <p className={m.sub}>No {filter === 'all' ? '' : filter} invoices.</p>
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Status</th>
                <th>Email</th>
                <th className={m.num}>Total</th>
                <th className={m.num}>Due</th>
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((i) => {
                const c = i.books_customers as unknown as { name: string; organisation: string | null } | null;
                const events = (i.books_invoice_events as unknown as { kind: string; at: string }[]) ?? [];
                const last = [...events].sort((a, b) => a.at.localeCompare(b.at)).filter((e) => e.kind !== 'paid').at(-1);
                const overdue = isOverdue(i, today);
                return (
                  <tr key={i.id}>
                    <td>
                      <Link className={s.link} href={`/account/books/invoices/${i.id}`}>
                        {i.number}
                      </Link>
                    </td>
                    <td>{c?.organisation || c?.name}</td>
                    <td>{ukDate(i.issue_date)}</td>
                    <td>{overdue ? <b>Overdue</b> : i.status[0].toUpperCase() + i.status.slice(1)}</td>
                    <td className={s.muted}>{last ? EMAIL_LABEL[last.kind] ?? last.kind : ''}</td>
                    <td className={m.num}>{formatPence(i.gross_pence)}</td>
                    <td className={m.num}>{formatPence(amountDue(i), { blankZero: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </BooksFrame>
  );
}
