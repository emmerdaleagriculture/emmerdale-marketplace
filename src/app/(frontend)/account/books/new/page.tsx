import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isPaymentAccount, isPurchaseCategory, isSaleCategory, type BusinessType } from '@/lib/books/chart';
import { registeredOn, type VatCode } from '@/lib/books/vat';
import { todayUk } from '@/lib/books/period';
import m from '../../market/market.module.css';
import { BooksFrame } from '../BooksFrame';
import { EntryForm } from '../EntryForm';

export const metadata: Metadata = { title: 'Record an entry', robots: { index: false, follow: false } };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams;
  const kind = k === 'sale' ? 'sale' : 'purchase';
  const access = await loadLedger(`/account/books/new?kind=${kind}`);
  if (!access.canEdit) redirect('/account/books');
  const l = access.ledger;
  const accounts = await getAccounts(l.id);
  const today = todayUk();
  const registered = registeredOn(
    { vat_registered: l.vat_registered, vat_registration_date: l.vat_registration_date, vat_scheme: l.vat_scheme as 'standard' },
    today,
  );
  const vatCodes: VatCode[] =
    kind === 'sale'
      ? registered
        ? ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE']
        : ['NOVAT', 'EXEMPT', 'OUTSIDE']
      : ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'RC', 'BLOCKED'];
  const categories = accounts.filter(kind === 'sale' ? isSaleCategory : isPurchaseCategory);
  const payments = accounts.filter((a) => isPaymentAccount(a, l.business_type as BusinessType));

  return (
    <BooksFrame access={access} title={kind === 'sale' ? 'Record a sale' : 'Record an expense'} tab={null} crumb={kind === 'sale' ? 'Sale' : 'Expense'}>
      <p className={m.sub}>
        {kind === 'sale'
          ? 'Money in for work you’ve done. It’s posted to your books straight away.'
          : 'Something the business bought. Keep the receipt: you’ll be able to attach it here soon.'}
      </p>
      <EntryForm
        kind={kind}
        today={today}
        categories={categories}
        payments={payments}
        defaultCategory={kind === 'sale' ? '4000' : '6990'}
        defaultPayment={payments.some((a) => a.code === l.default_payment_account) ? l.default_payment_account : '1200'}
        vatCodes={vatCodes}
        defaultVat={vatCodes[0]}
      />
    </BooksFrame>
  );
}
