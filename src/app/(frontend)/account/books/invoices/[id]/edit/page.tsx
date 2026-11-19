import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { loadInvoice } from '@/lib/books/invoices.server';
import { penceToDecimal } from '@/lib/books/money';
import { BooksFrame } from '../../../BooksFrame';
import { InvoiceForm } from '../../InvoiceForm';

export const metadata: Metadata = { title: 'Edit invoice', robots: { index: false, follow: false } };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const access = await loadLedger(`/account/books/invoices/${raw}/edit`);
  const inv = await loadInvoice(access.ledger.id, Number(raw));
  if (!inv) notFound();
  if (!access.canEdit || inv.status !== 'draft') redirect(`/account/books/invoices/${inv.id}`);
  const l = access.ledger;
  const [{ data: customers }, accounts] = await Promise.all([
    createServiceRoleClient().from('books_customers').select('id, name, organisation').eq('ledger_id', l.id).order('name').limit(1000),
    getAccounts(l.id),
  ]);
  return (
    <BooksFrame access={access} title={`Edit invoice ${inv.number}`} tab="invoices" crumb={`Invoice ${inv.number}`}>
      <InvoiceForm
        invoiceId={inv.id}
        customers={customers ?? []}
        incomeAccounts={accounts.filter((a) => a.type === 'income').map(({ code, name }) => ({ code, name }))}
        termsDays={l.invoice_terms_days}
        registeredFrom={l.vat_registered ? (l.vat_registration_date ?? '0000-01-01') : null}
        values={{
          customer_id: inv.customer_id,
          number: inv.number,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          notes: inv.notes ?? '',
          lines: inv.lines.map((x) => ({
            description: x.description,
            quantity: String(Number(x.quantity)),
            unit: penceToDecimal(x.unit_pence),
            vat_code: x.vat_code === 'NOVAT' ? 'STD' : x.vat_code,
            account_code: x.account_code,
          })),
        }}
      />
    </BooksFrame>
  );
}
