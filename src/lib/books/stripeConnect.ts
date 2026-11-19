/**
 * Card payments for Books invoices through the contractor's own Stripe
 * account (Connect Standard). The platform key acts on the connected account
 * with the Stripe-Account header; charges are direct, so the money, the fees,
 * refunds and disputes are the contractor's. No platform fee.
 */

import type Stripe from 'stripe';
import { Resend } from 'resend';
import { getStripe } from '@/lib/stripe';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import { formatPence } from './money';
import { todayUk } from './period';
import { addEvent, loadInvoice, recordPayment, type InvoiceFull } from './invoices.server';
import type { Ledger } from './server';

export function cardPaymentsReady(l: Pick<Ledger, 'stripe_account_id' | 'stripe_charges_enabled'>): boolean {
  return Boolean(l.stripe_account_id && l.stripe_charges_enabled);
}

/** Create the contractor's Stripe account if needed, and a link to Stripe's onboarding. */
export async function onboardingLink(ledger: Ledger, email: string | null): Promise<string> {
  const stripe = getStripe();
  const admin = createServiceRoleClient();
  let accountId = ledger.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      country: 'GB',
      email: email ?? undefined,
      business_profile: { name: ledger.trading_name || ledger.legal_name },
      metadata: { books_ledger: ledger.id },
    });
    accountId = account.id;
    await admin.from('books_ledgers').update({ stripe_account_id: accountId, stripe_connected_at: new Date().toISOString() }).eq('id', ledger.id);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${siteUrl()}/account/books/stripe?refresh=1`,
    return_url: `${siteUrl()}/account/books/stripe?return=1`,
  });
  return link.url;
}

/** Re-read the account from Stripe and keep the flags on the ledger. */
export async function refreshAccount(ledger: Ledger): Promise<Ledger> {
  if (!ledger.stripe_account_id) return ledger;
  const acct = await getStripe().accounts.retrieve(ledger.stripe_account_id);
  return applyAccount(acct);
}

export async function applyAccount(acct: Stripe.Account): Promise<Ledger> {
  const { data } = await createServiceRoleClient()
    .from('books_ledgers')
    .update({ stripe_charges_enabled: Boolean(acct.charges_enabled), stripe_details_submitted: Boolean(acct.details_submitted) })
    .eq('stripe_account_id', acct.id)
    .select('*')
    .maybeSingle();
  return data as Ledger;
}

/** A Checkout session for what's due on an invoice, on the contractor's account. */
export async function invoiceCheckout(inv: InvoiceFull, ledger: Ledger): Promise<string> {
  const due = Math.max(0, inv.gross_pence - inv.paid_pence);
  if (!cardPaymentsReady(ledger) || due <= 0) throw new Error('not payable');
  const name = ledger.trading_name || ledger.legal_name;
  const back = `${siteUrl()}/i/${inv.public_token}`;
  const tag = `${inv.ledger_id}:${inv.id}`;
  const session = await getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      currency: 'gbp',
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'gbp', unit_amount: due, product_data: { name: `Invoice ${inv.number} from ${name}` } },
        },
      ],
      customer_email: inv.customer.email ?? undefined,
      payment_intent_data: { metadata: { books_invoice: tag }, description: `Invoice ${inv.number}` },
      metadata: { books_invoice: tag },
      success_url: `${back}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: back,
    },
    { stripeAccount: ledger.stripe_account_id! },
  );
  await createServiceRoleClient().from('books_invoices').update({ stripe_session_id: session.id }).eq('id', inv.id);
  return session.url!;
}

/**
 * Record a paid Checkout session against its invoice (on return from Stripe
 * and from the webhook; the payment's external id makes the second a no-op).
 * Returns true when a new payment was recorded.
 */
export async function confirmCheckout(sessionId: string, accountId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data: ledger } = await admin.from('books_ledgers').select('*').eq('stripe_account_id', accountId).maybeSingle();
  if (!ledger) return false;
  const session = await getStripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
  if (session.payment_status !== 'paid') return false;
  const [ledgerId, invoiceId] = String(session.metadata?.books_invoice ?? '').split(':');
  if (ledgerId !== ledger.id) return false;
  const inv = await loadInvoice(ledger.id, Number(invoiceId));
  if (!inv) return false;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const externalId = `stripe-pi:${pi ?? session.id}`;
  if (inv.payments.some((p) => p.external_id === externalId)) return false;
  const amount = Math.min(session.amount_total ?? 0, Math.max(0, inv.gross_pence - inv.paid_pence));
  if (amount <= 0) return false;
  const res = await recordPayment(ledger as Ledger, inv, {
    paid_on: todayUk(),
    amount_pence: amount,
    method: 'stripe',
    reference: pi ?? session.id,
    external_id: externalId,
  });
  if (!res.ok) {
    console.error('[books] card payment not recorded', { invoice: inv.id, error: res.error });
    return false;
  }
  await addEvent(inv.id, 'paid', { detail: `Card payment ${formatPence(amount)}` });
  await paymentAlert(ledger as Ledger, inv, amount);
  return true;
}

/** Tell the contractor a customer paid by card. */
async function paymentAlert(ledger: Ledger, inv: InvoiceFull, amount: number) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    let to = ledger.invoice_reply_to;
    if (!to) {
      const { data } = await createServiceRoleClient().auth.admin.getUserById(ledger.contractor_id);
      to = data.user?.email ?? null;
    }
    if (!to) return;
    const left = Math.max(0, inv.gross_pence - inv.paid_pence - amount);
    await new Resend(key).emails.send({
      from: `Emmerdale Books <${process.env.BOOKS_INVOICE_FROM || 'invoices@emmerdaleagriculture.com'}>`,
      to: [to],
      subject: `${inv.customer.organisation || inv.customer.name} paid invoice ${inv.number}: ${formatPence(amount)}`,
      text: [
        `${inv.customer.organisation || inv.customer.name} paid ${formatPence(amount)} by card on invoice ${inv.number} (total ${formatPence(inv.gross_pence)}).`,
        left > 0 ? `${formatPence(left)} is still due.` : 'It is now paid in full.',
        '',
        `It’s in your books and will arrive in your bank with your next Stripe payout, less Stripe’s fee.`,
        `${siteUrl()}/account/books/invoices/${inv.id}`,
      ].join('\n'),
      tags: [{ name: 'kind', value: 'books_payment_alert' }],
    });
  } catch (err) {
    console.error('[books] payment alert failed', err instanceof Error ? err.message : err);
  }
}

/** The signed-in user's email, for prefilling Stripe onboarding. */
export async function currentEmail(): Promise<string | null> {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return user?.email ?? null;
}

