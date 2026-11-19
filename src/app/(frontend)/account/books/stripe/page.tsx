import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loadLedger } from '@/lib/books/server';
import { refreshAccount } from '@/lib/books/stripeConnect';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { BooksFrame } from '../BooksFrame';
import { ConnectButton, SyncButton } from './StripeButtons';

export const metadata: Metadata = { title: 'Card payments', robots: { index: false, follow: false } };

/**
 * Card payments: connect the contractor's own Stripe account. Stripe runs the
 * sign-up (identity, bank account) on its own pages; we keep only the account
 * id and whether it can take payments.
 */
export default async function StripePage({ searchParams }: { searchParams: Promise<{ return?: string; refresh?: string }> }) {
  const access = await loadLedger('/account/books/stripe');
  if (!access.canEdit) redirect('/account/books');
  const sp = await searchParams;
  let ledger = access.ledger;
  if (ledger.stripe_account_id && (sp.return || sp.refresh || !ledger.stripe_charges_enabled)) {
    try {
      ledger = await refreshAccount(ledger);
    } catch (err) {
      console.error('[books] stripe refresh failed', err instanceof Error ? err.message : err);
    }
  }
  const ready = Boolean(ledger.stripe_account_id && ledger.stripe_charges_enabled);

  return (
    <BooksFrame access={{ ...access, ledger }} title="Card payments" tab="invoices" crumb="Card payments">
      {ready ? (
        <>
          <p className={s.notice}>
            <b>Stripe is connected.</b> Your invoices now show a Pay by card button. The money goes to your own Stripe
            account and on to your bank with Stripe’s payouts.
          </p>
          <p className={m.sub}>
            Card payments are recorded on the invoice as soon as they’re made. Each night Books also brings in Stripe’s
            fees, payouts to your bank and any refunds, so your Stripe balance (1220) matches Stripe.
          </p>
          <div className={s.actions}>
            <SyncButton />
          </div>
          <p className={m.fine}>
            Stripe charges you its standard card fee on each payment. Emmerdale takes nothing. Manage refunds, disputes
            and payouts in your own Stripe dashboard.
          </p>
        </>
      ) : (
        <>
          <p className={m.lead}>
            Let customers pay your invoices by card. You connect your own Stripe account: the money goes straight to
            you, and Emmerdale takes no cut.
          </p>
          {ledger.stripe_account_id && ledger.stripe_details_submitted && (
            <p className={s.readOnly}>Stripe is still checking your details. This page will update when it can take payments.</p>
          )}
          {ledger.stripe_account_id && !ledger.stripe_details_submitted && (
            <p className={s.readOnly}>You started connecting Stripe but haven’t finished. Carry on where you left off.</p>
          )}
          <ConnectButton label={ledger.stripe_account_id ? 'Continue with Stripe' : 'Connect Stripe'} />
          <p className={m.fine}>
            Stripe will ask for your business details, your identity and the bank account to pay you into. If you
            already use Stripe, sign in with it. Stripe charges its standard card fee on each payment.
          </p>
        </>
      )}
    </BooksFrame>
  );
}
