import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import { formatPence } from '@/lib/books/money';
import { ukDate } from '@/lib/books/period';
import m from '../../../market/market.module.css';
import s from '../../books.module.css';
import { BooksFrame } from '../../BooksFrame';
import { CustomerForm } from '../CustomerForm';

export const metadata: Metadata = { title: 'Customer', robots: { index: false, follow: false } };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const access = await loadLedger(`/account/books/customers/${raw}`);
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) notFound();
  const admin = createServiceRoleClient();
  const { data: c } = await admin.from('books_customers').select('*').eq('id', id).eq('ledger_id', access.ledger.id).maybeSingle();
  if (!c) notFound();
  const { data: invoices } = await admin
    .from('books_invoices')
    .select('id, number, status, issue_date, gross_pence, paid_pence')
    .eq('customer_id', id)
    .order('issue_date', { ascending: false })
    .limit(200);
  return (
    <BooksFrame access={access} title={c.name} tab="invoices" crumb={c.name}>
      {(invoices ?? []).length > 0 && (
        <div className={m.tableWrap} style={{ marginBottom: 28 }}>
          <table className={m.table}>
            <tbody>
              {(invoices ?? []).map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className={s.link} href={`/account/books/invoices/${i.id}`}>
                      {i.number}
                    </Link>
                  </td>
                  <td>{ukDate(i.issue_date)}</td>
                  <td className={s.muted}>{i.status}</td>
                  <td className={m.num}>{formatPence(i.gross_pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {access.canEdit ? <CustomerForm v={c} /> : <p className={m.sub}>{[c.email, c.phone, c.address].filter(Boolean).join(' · ')}</p>}
    </BooksFrame>
  );
}
