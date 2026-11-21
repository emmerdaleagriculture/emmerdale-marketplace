import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { invoiceNumbers } from '@/lib/books/invoices.server';
import { nextInvoiceNumber } from '@/lib/books/invoice';
import { addDays, todayUk } from '@/lib/books/period';
import { BooksFrame } from '../../BooksFrame';
import { InvoiceForm } from '../InvoiceForm';

export const metadata: Metadata = { title: 'New invoice', robots: { index: false, follow: false } };


export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const access = await loadLedger('/account/books/invoices/new');
  if (!access.canEdit) redirect('/account/books/invoices');
  const l = access.ledger;
  const { customer } = await searchParams;
  const [{ data: customers }, accounts, numbers] = await Promise.all([
    createServiceRoleClient().from('books_customers').select('id, name, organisation, email, phone, address, vat_number').eq('ledger_id', l.id).order('name').limit(1000),
    getAccounts(l.id),
    invoiceNumbers(l.id),
  ]);
  const today = todayUk();
  const cid = Number(customer);
  return (
    <BooksFrame access={access} title="New invoice" tab="invoices" crumb="New invoice">
      <InvoiceForm
        customers={customers ?? []}
        incomeAccounts={accounts.filter((a) => a.type === 'income').map(({ code, name }) => ({ code, name }))}
        termsDays={l.invoice_terms_days}
        registeredFrom={l.vat_registered ? (l.vat_registration_date ?? '0000-01-01') : null}
        values={{
          customer_id: (customers ?? []).some((c) => c.id === cid) ? cid : null,
          number: nextInvoiceNumber(numbers),
          issue_date: today,
          due_date: addDays(today, l.invoice_terms_days),
          notes: '',
          lines: [{ description: '', quantity: '1', unit: '', vat_code: 'STD', account_code: '4000' }],
        }}
      />
    </BooksFrame>
  );
}
