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
import { loadInvoice, recordPayment, type InvoiceFull } from './invoices.server';
import type { Json } from '@/lib/database.types';
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
  return (await applyAccount(acct)) ?? ledger;
}

export async function applyAccount(acct: Stripe.Account): Promise<Ledger | null> {
  const { data } = await createServiceRoleClient()
    .from('books_ledgers')
    .update({ stripe_charges_enabled: Boolean(acct.charges_enabled), stripe_details_submitted: Boolean(acct.details_submitted) })
    .eq('stripe_account_id', acct.id)
    .select('*')
    .maybeSingle();
  return (data as Ledger | null) ?? null;
}

/**
 * Close an invoice's open Checkout session, so a stale tab can't take a card
 * payment after the invoice was paid another way, voided, or re-opened for a
 * new amount. Best effort: a session already completed or expired is fine.
 */
export async function expireInvoiceSession(inv: { id: number; stripe_session_id: string | null }, ledger: Pick<Ledger, 'stripe_account_id'>) {
  if (!inv.stripe_session_id || !ledger.stripe_account_id) return;
  try {
    const stripe = getStripe();
    const s = await stripe.checkout.sessions.retrieve(inv.stripe_session_id, {}, { stripeAccount: ledger.stripe_account_id });
    if (s.status === 'open') await stripe.checkout.sessions.expire(s.id, {}, { stripeAccount: ledger.stripe_account_id });
  } catch (err) {
    console.error('[books] could not expire checkout session', { invoice: inv.id, error: err instanceof Error ? err.message : err });
  }
}

/** A Checkout session for what's due on an invoice, on the contractor's account. */
export async function invoiceCheckout(inv: InvoiceFull, ledger: Ledger): Promise<string> {
  const due = Math.max(0, inv.gross_pence - inv.paid_pence);
  if (!cardPaymentsReady(ledger) || due <= 0 || inv.status !== 'issued') throw new Error('not payable');
  // One live session per invoice: a second tab, or yesterday's, can't pay again.
  await expireInvoiceSession(inv, ledger);
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
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    { stripeAccount: ledger.stripe_account_id! },
  );
  await createServiceRoleClient().from('books_invoices').update({ stripe_session_id: session.id }).eq('id', inv.id);
  return session.url!;
}

/**
 * Book a paid Checkout session (on return from Stripe and from the webhook).
 * Every penny Stripe took lands in the books: up to what's due is the
 * invoice's payment (Dr 1220 / Cr 1100); anything more (the invoice was
 * paid another way meanwhile, or voided) goes in as money owed back to the
 * customer, and the contractor is told to refund it. Returns true when this
 * call recorded it. Throws if it couldn't, so the webhook is retried.
 */
export async function confirmCheckout(sessionId: string, accountId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data: ledgerRow } = await admin.from('books_ledgers').select('*').eq('stripe_account_id', accountId).maybeSingle();
  if (!ledgerRow) return false;
  const ledger = ledgerRow as Ledger;
  const session = await getStripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
  if (session.payment_status !== 'paid') return false;
  const [ledgerId, invoiceId] = String(session.metadata?.books_invoice ?? '').split(':');
  if (ledgerId !== ledger.id) return false;
  const inv = await loadInvoice(ledger.id, Number(invoiceId));
  if (!inv) return false;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const ref = pi ?? session.id;
  const externalId = `stripe-pi:${ref}`;
  const total = session.amount_total ?? 0;
  if (total <= 0) return false;

  // One caller wins: the unique 'paid' event per payment reference.
  const { error: claimErr } = await admin
    .from('books_invoice_events')
    .insert({ invoice_id: inv.id, kind: 'paid', message_id: externalId, detail: `Card payment ${formatPence(total)}` });
  if (claimErr) {
    if (claimErr.code === '23505') return false; // already being recorded or recorded
    throw new Error(`claim failed: ${claimErr.message}`);
  }
  try {
    const due = inv.status === 'issued' ? Math.max(0, inv.gross_pence - inv.paid_pence) : 0;
    const applied = Math.min(total, due);
    if (applied > 0) {
      const res = await recordPayment(ledger, inv, { paid_on: todayUk(), amount_pence: applied, method: 'stripe', reference: ref, external_id: externalId });
      if (!res.ok) throw new Error(res.error);
    }
    const excess = total - applied;
    if (excess > 0) {
      const { error } = await admin.rpc('books_post_entry', {
        p_ledger_id: ledger.id,
        p_entry: {
          entry_date: todayUk(),
          kind: 'journal',
          source: 'stripe',
          counterparty: inv.customer.organisation || inv.customer.name,
          reference: inv.number,
          description: `Card payment of ${formatPence(excess)} more than was due on invoice ${inv.number}: refund it in Stripe`,
          vat_code: 'OUTSIDE',
          net_pence: excess,
          gross_pence: excess,
          external_id: `stripe-excess:${ref}`,
          meta: { invoice_id: inv.id },
        } as unknown as Json,
        p_lines: [
          { code: '1220', debit: excess, credit: 0 },
          { code: '1100', debit: 0, credit: excess, memo: 'Owed back to the customer' },
        ] as unknown as Json,
      });
      if (error) throw new Error(error.message);
    }
    await paymentAlert(ledger, inv, applied, excess);
    return true;
  } catch (err) {
    // Release the claim so the webhook's retry can record it.
    await admin.from('books_invoice_events').delete().eq('invoice_id', inv.id).eq('kind', 'paid').eq('message_id', externalId);
    throw err;
  }
}

/** Tell the contractor a customer paid by card. */
async function paymentAlert(ledger: Ledger, inv: InvoiceFull, amount: number, excess = 0) {
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
      subject: `${inv.customer.organisation || inv.customer.name} paid invoice ${inv.number}: ${formatPence(amount + excess)}`,
      text: [
        `${inv.customer.organisation || inv.customer.name} paid ${formatPence(amount)} by card on invoice ${inv.number} (total ${formatPence(inv.gross_pence)}).`,
        left > 0 ? `${formatPence(left)} is still due.` : 'It is now paid in full.',
        excess > 0
          ? `\nThey paid ${formatPence(excess)} more than was due (the invoice had already been paid or was voided). It’s recorded as owed back to them: refund it from your Stripe dashboard.`
          : '',
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

