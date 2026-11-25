import type { Metadata } from 'next';
import Link from 'next/link';
import s from '../books.module.css';
import { redirect } from 'next/navigation';
import { getAccounts, loadLedger } from '@/lib/books/server';
import { isBankAccount } from '@/lib/books/chart';
import { receiptsAddress } from '@/lib/books/inbound';
import { createClient } from '@/lib/supabase/server';
import { BooksFrame } from '../BooksFrame';
import { SettingsForm } from '../SettingsForm';
import { saveSettingsAction } from '../actions';
import { StripeSettings } from '../stripe/StripeSettings';
import { oauthReady, refreshAccount } from '@/lib/books/stripeConnect';
import { listViewers, MAX_VIEWERS } from '@/lib/books/viewers.server';
import { ViewersSection } from './ViewersSection';
import { InvoiceBranding } from './InvoiceBranding';
import { logoUrl } from '@/lib/books/branding';
import { filingAvailable, readSecrets, secretsSummary } from '@/lib/books/filing.server';
import { FilingSettings } from './FilingSettings';

export const metadata: Metadata = { title: 'Books settings', robots: { index: false, follow: false } };

export default async function BooksSettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const access = await loadLedger('/account/books/settings');
  if (!access.canEdit) redirect('/account/books');
  const accounts = await getAccounts(access.ledger.id);
  let l = access.ledger;
  // Back from Stripe, or part-way through: ask Stripe where the account has got to.
  const stripeNote = (await searchParams).stripe;
  if (l.stripe_account_id && (stripeNote || !l.stripe_charges_enabled)) {
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
  const filing = await filingAvailable(l, email);
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
      <p className={s.notice}>
        Starting balances, or moving from Xero or FreshBooks?{' '}
        <Link className={s.link} href="/account/books/import">
          Set them up here →
        </Link>
      </p>
      <StripeSettings ledger={l} canLink={oauthReady()} notice={stripeNote} />
      <SettingsForm
        action={saveSettingsAction}
        setup={false}
        paymentAccounts={accounts.filter(isBankAccount)}
        receiptsAddress={receiptsAddress(l.inbound_code)}
        accountEmail={email}
        values={{ ...withoutSecrets(l), flat_rate_percent: l.flat_rate_percent == null ? null : Number(l.flat_rate_percent) }}
      />
      <InvoiceBranding logoUrl={logoUrl(l.invoice_logo_path)} colour={l.invoice_colour} name={l.trading_name || l.legal_name} />
      {filing && <FilingSettings saved={secretsSummary(readSecrets(l))} companyNumber={l.company_number} utr={l.utr} />}
      <ViewersSection viewers={viewers} max={MAX_VIEWERS} />
    </BooksFrame>
  );
}

/** The ledger without its sealed filing secrets: the form is a client component, and nothing sealed needs to reach a browser. */
function withoutSecrets<T extends { filing_secrets?: unknown }>(l: T): Omit<T, 'filing_secrets'> {
  const { filing_secrets: _s, ...rest } = l;
  return rest;
}
