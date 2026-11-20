import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isBankAccount } from '@/lib/books/chart';
import { receiptsAddress } from '@/lib/books/inbound';
import { createClient } from '@/lib/supabase/server';
import { BooksFrame } from '../BooksFrame';
import { SettingsForm } from '../SettingsForm';
import { saveSettingsAction } from '../actions';
import { StripeSettings } from '../stripe/StripeSettings';
import { refreshAccount } from '@/lib/books/stripeConnect';
import { listViewers, MAX_VIEWERS } from '@/lib/books/viewers.server';
import { ViewersSection } from './ViewersSection';

export const metadata: Metadata = { title: 'Books settings', robots: { index: false, follow: false } };

export default async function BooksSettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const access = await loadLedger('/account/books/settings');
  if (!access.canEdit) redirect('/account/books');
  const accounts = await getAccounts(access.ledger.id);
  let l = access.ledger;
  // Back from Stripe, or part-way through: ask Stripe where the account has got to.
  if (l.stripe_account_id && ((await searchParams).stripe || !l.stripe_charges_enabled)) {
    try {
      l = await refreshAccount(l);
    } catch (err) {
      console.error('[books] stripe refresh failed', err instanceof Error ? err.message : err);
    }
  }
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const email = user?.email ?? null;
  const viewers = (await listViewers(l.id)).map((v) => ({
    id: v.id,
    email: v.email,
    name: v.name,
    accepted: Boolean(v.user_id),
    lastSeen: v.last_seen_at
      ? new Date(v.last_seen_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
      : null,
  }));
  return (
    <BooksFrame access={{ ...access, ledger: l }} title="Settings" tab="settings" crumb="Settings">
      <StripeSettings ledger={l} />
      <SettingsForm
        action={saveSettingsAction}
        setup={false}
        paymentAccounts={accounts.filter(isBankAccount)}
        receiptsAddress={receiptsAddress(l.inbound_code)}
        accountEmail={email}
        values={{ ...l, flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent) }}
      />
      <ViewersSection viewers={viewers} max={MAX_VIEWERS} />
    </BooksFrame>
  );
}
