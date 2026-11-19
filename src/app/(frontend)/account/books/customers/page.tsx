import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { loadLedger } from '@/lib/books/server';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { CustomerForm } from './CustomerForm';

export const metadata: Metadata = { title: 'Customers', robots: { index: false, follow: false } };

export default async function CustomersPage() {
  const access = await loadLedger('/account/books/customers');
  const { data } = await createServiceRoleClient()
    .from('books_customers')
    .select('id, name, organisation, email, phone')
    .eq('ledger_id', access.ledger.id)
    .order('name')
    .limit(1000);
  const customers = data ?? [];
  return (
    <BooksFrame access={access} title="Customers" tab="invoices" crumb="Customers">
      {customers.length === 0 ? (
        <p className={m.sub}>No customers yet. Add one here, or while writing an invoice.</p>
      ) : (
        <div className={m.tableWrap} style={{ marginBottom: 28 }}>
          <table className={m.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className={s.link} href={`/account/books/customers/${c.id}`}>
                      {c.name}
                    </Link>
                    {c.organisation ? <span className={s.muted}> · {c.organisation}</span> : null}
                  </td>
                  <td>{c.email ?? ''}</td>
                  <td>{c.phone ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {access.canEdit && (
        <>
          <h2 className={m.h2}>Add a customer</h2>
          <CustomerForm />
        </>
      )}
    </BooksFrame>
  );
}
