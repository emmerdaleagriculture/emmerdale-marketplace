import m from '../../market/market.module.css';
import s from '../books.module.css';
import type { Ledger } from '@/lib/books/server';
import { ConnectButton, LinkButton, SyncButton } from './StripeButtons';

/**
 * Card payments, in Books settings: what connecting Stripe does, how to set
 * it up, and the button. Stripe runs the sign-up on its own pages and sends
 * the person back to settings; we keep only the account id and whether it
 * can take payments.
 */
const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  linked: { text: 'Your Stripe account is linked. Its last month of payments, fees and payouts is in your books, and it is kept up to date each night.' },
  'link-cancelled': { text: 'Stripe wasn’t linked: you cancelled on Stripe’s page.', bad: true },
  'link-taken': { text: 'That Stripe account is already linked to another business’s books.', bad: true },
  'link-failed': { text: 'Stripe wasn’t linked. Please try again.', bad: true },
};

export function StripeSettings({ ledger, canLink = false, notice }: { ledger: Ledger; canLink?: boolean; notice?: string }) {
  const ready = Boolean(ledger.stripe_account_id && ledger.stripe_charges_enabled);
  const started = Boolean(ledger.stripe_account_id);
  const note = notice ? NOTICES[notice] : undefined;
  const existing = canLink && (
    <div style={{ marginTop: 16 }}>
      <p style={{ margin: '0 0 6px' }}>
        <b>{started ? 'Take card payments through a different Stripe account?' : 'Already take card payments through Stripe?'}</b>
      </p>
      <p className={m.fine} style={{ margin: '0 0 8px' }}>
        Link the Stripe account you already use, for example the one your current invoicing software is paid through.
        Books then brings in every card payment, fee and payout from it, so payouts on your bank statement match
        without you doing anything, and your Books invoices are paid into the same account.
        {started && ' It takes the place of the account connected now.'} You sign in on Stripe’s own page; Emmerdale
        never sees your Stripe password.
      </p>
      <LinkButton label={started ? 'Link my other Stripe account' : 'Link my existing Stripe account'} />
    </div>
  );
  return (
    <fieldset className={s.fieldset} id="card-payments" style={{ marginBottom: 20 }}>
      <legend>Card payments (Stripe)</legend>
      {note && <p className={note.bad ? s.readOnly : s.notice}>{note.text}</p>}
      {ready ? (
        <>
          <p className={s.notice}>
            <b>Stripe is connected.</b> Your invoices show a <b>Pay by card</b> button, and the money goes to your own
            Stripe account, then on to your bank with Stripe’s payouts.
          </p>
          <ul className={m.fine} style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            <li>A card payment is marked on the invoice as soon as it’s made.</li>
            <li>
              Each night Books brings in Stripe’s fees, payouts to your bank and any refunds, so your Stripe balance (1220)
              matches Stripe. Use the button to do it now.
            </li>
            <li>
              Refunds, disputes and payout timings are managed in your{' '}
              <a className={s.link} href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                Stripe dashboard ↗
              </a>
              .
            </li>
          </ul>
          <SyncButton />
          <p className={m.fine} style={{ marginTop: 12 }}>
            Connected account: <code>{ledger.stripe_account_id}</code>
          </p>
          {existing}
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px' }}>
            Let customers pay your invoices by card from the invoice link or email. You connect your own Stripe account:
            payments go straight to you and Emmerdale takes no cut.
          </p>
          {started && ledger.stripe_details_submitted && (
            <p className={s.readOnly}>Stripe is still checking your details. This will update once it can take payments, usually within a day.</p>
          )}
          {started && !ledger.stripe_details_submitted && (
            <p className={s.readOnly}>You started connecting Stripe but didn’t finish. Carry on where you left off.</p>
          )}
          <p style={{ margin: '0 0 6px' }}>
            <b>How to set it up</b> (about 10 minutes)
          </p>
          <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.55 }}>
            <li>
              Have these to hand: your date of birth and home address, the business’s details (and company number if
              it’s a limited company), and the sort code and account number Stripe should pay you into. Stripe may also
              ask for a photo of your passport or driving licence.
            </li>
            <li>
              Press <b>{started ? 'Continue with Stripe' : 'Connect Stripe'}</b>. You’ll go to Stripe’s own secure pages;
              nothing you enter there is seen or kept by Emmerdale.
            </li>
            <li>
              Create your Stripe login with your email and a password, or sign in if you already have one (Stripe keeps
              these payments in a separate account under the same login).
            </li>
            <li>Answer Stripe’s questions about the business, you and your bank account, then agree to Stripe’s terms.</li>
            <li>
              Stripe sends you back here. Once it has checked your details, often straight away and sometimes within a
              day, this section says <b>Stripe is connected</b> and your invoices show <b>Pay by card</b>.
            </li>
          </ol>
          <ConnectButton label={started ? 'Continue with Stripe' : 'Connect Stripe'} />
          <p className={m.fine} style={{ marginTop: 12 }}>
            Stripe charges its standard fee on each card payment (see{' '}
            <a className={s.link} href="https://stripe.com/gb/pricing" target="_blank" rel="noopener noreferrer">
              Stripe’s UK pricing ↗
            </a>
            ). There’s no monthly charge from Stripe or from us. Books records the fees for you, so your profit and VAT
            stay right.
          </p>
          {existing}
        </>
      )}
    </fieldset>
  );
}
