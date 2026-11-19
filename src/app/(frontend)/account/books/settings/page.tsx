import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isBankAccount } from '@/lib/books/chart';
import { BooksFrame } from '../BooksFrame';
import { SettingsForm } from '../SettingsForm';
import { saveSettingsAction } from '../actions';

export const metadata: Metadata = { title: 'Books settings', robots: { index: false, follow: false } };

export default async function BooksSettingsPage() {
  const access = await loadLedger('/account/books/settings');
  if (!access.canEdit) redirect('/account/books');
  const accounts = await getAccounts(access.ledger.id);
  const l = access.ledger;
  return (
    <BooksFrame access={access} title="Settings" tab="settings" crumb="Settings">
      <SettingsForm
        action={saveSettingsAction}
        setup={false}
        paymentAccounts={accounts.filter(isBankAccount)}
        values={{ ...l, flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent) }}
      />
    </BooksFrame>
  );
}
