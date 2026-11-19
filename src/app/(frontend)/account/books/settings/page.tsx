import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isBankAccount } from '@/lib/books/chart';
import { receiptsAddress } from '@/lib/books/inbound';
import { createClient } from '@/lib/supabase/server';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { SettingsForm } from '../SettingsForm';
import { saveSettingsAction } from '../actions';

export const metadata: Metadata = { title: 'Books settings', robots: { index: false, follow: false } };

export default async function BooksSettingsPage() {
  const access = await loadLedger('/account/books/settings');
  if (!access.canEdit) redirect('/account/books');
  const accounts = await getAccounts(access.ledger.id);
  const l = access.ledger;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const email = user?.email ?? null;
  return (
    <BooksFrame access={access} title="Settings" tab="settings" crumb="Settings">
      {/* Card payments live on their own page (Stripe runs the sign-up); this is the way in from settings. */}
      <fieldset className={s.fieldset} style={{ marginBottom: 20 }}>
        <legend>Card payments</legend>
        <p style={{ margin: '0 0 12px' }}>
          {l.stripe_charges_enabled
            ? 'Stripe is connected: your invoices show a Pay by card button, and payments go straight to your own Stripe account.'
            : l.stripe_account_id
              ? 'You’ve started connecting Stripe but it can’t take payments yet.'
              : 'Connect your own Stripe account and customers can pay your invoices by card. The money goes to you; Emmerdale takes no cut.'}
        </p>
        <Link className={l.stripe_charges_enabled ? f.btnGhost : f.btnPrimary} href="/account/books/stripe">
          {l.stripe_charges_enabled ? 'Manage card payments' : l.stripe_account_id ? 'Continue with Stripe' : 'Connect Stripe'}
        </Link>
      </fieldset>
      <SettingsForm
        action={saveSettingsAction}
        setup={false}
        paymentAccounts={accounts.filter(isBankAccount)}
        receiptsAddress={receiptsAddress(l.inbound_code)}
        accountEmail={email}
        values={{ ...l, flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent) }}
      />
    </BooksFrame>
  );
}
