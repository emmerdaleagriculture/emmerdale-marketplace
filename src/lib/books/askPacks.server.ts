import type Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe, stripeCustomerFor } from '@/lib/stripe';
import { notifyAdmins } from '@/lib/adminNotify';
import { PACK_KIND, packToGrant, TOKEN_PACK, type PackSession } from './askTokens';

/**
 * Buying an Ask token pack: a one-off card payment through Stripe Checkout.
 * The tokens are granted when the payment is confirmed, by whichever gets
 * there first: the webhook, or the buyer landing back on the Ask page. Both
 * call grantPackFromSession, which grants once per Checkout session.
 */

const ASK_PATH = '/account/books/ask';

export async function packCheckoutUrl(contractorId: string): Promise<string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const meta = { kind: PACK_KIND, contractor_id: contractorId };
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: await stripeCustomerFor(contractorId),
    // Cards only (Apple Pay and Google Pay included): paid or not on the spot, never "pending".
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: TOKEN_PACK.pence,
          product_data: { name: `${TOKEN_PACK.tokens} Ask tokens`, description: 'Questions answered from your books and your Emmerdale work. One token a question. They don’t expire.' },
        },
        quantity: 1,
      },
    ],
    metadata: meta,
    payment_intent_data: { metadata: meta },
    success_url: `${site}${ASK_PATH}?pack=paid&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}${ASK_PATH}?pack=cancelled`,
  });
  return session.url!;
}

export type PackGrant = 'granted' | 'already' | 'not-a-pack';

/** Grant the pack a paid Checkout session bought. Safe to call any number of times. */
export async function grantPackFromSession(session: Stripe.Checkout.Session): Promise<PackGrant> {
  const grant = packToGrant(session as unknown as PackSession);
  if (!grant) return 'not-a-pack';
  const admin = createServiceRoleClient();
  const { error } = await admin.from('ask_token_lots').insert({
    contractor_id: grant.contractorId,
    kind: 'pack',
    tokens: grant.tokens,
    remaining: grant.tokens,
    stripe_session_id: grant.sessionId,
    stripe_payment_intent_id: grant.paymentIntentId,
  });
  // The session id is unique: a second grant for the same payment lands here.
  if (error?.code === '23505') return 'already';
  if (error) throw new Error(`ask pack grant: ${error.message}`);

  // The receipt goes out once per session too; a failure here mustn't undo the tokens.
  try {
    const { data: ct } = await admin.from('contractors').select('email, receipt_email, contact_name, business_name').eq('id', grant.contractorId).maybeSingle();
    const to = ct?.receipt_email || ct?.email || session.customer_details?.email || null;
    if (to) {
      const { error: receiptErr } = await admin.rpc('sq_issue_receipt', {
        p_key: `ask_pack:${grant.sessionId}`,
        p_receipt_no: `EA-T-${grant.sessionId.slice(-8).toUpperCase()}`,
        p_kind: 'tokens',
        p_email_kind: 'sq_membership_receipt',
        p_to_email: to,
        p_amount_pence: TOKEN_PACK.pence,
        p_paid_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        p_submission_id: null as unknown as string,
        p_contractor_id: grant.contractorId,
        p_payload: { contact_name: ct?.contact_name ?? null, business_name: ct?.business_name ?? null, description: `${grant.tokens} Ask tokens` },
      });
      if (receiptErr) throw new Error(receiptErr.message);
    }
  } catch (err) {
    console.error('[ask] pack receipt failed', { session: grant.sessionId, error: err instanceof Error ? err.message : err });
  }
  return 'granted';
}

/**
 * The buyer is back from Checkout: confirm their session with Stripe and
 * grant it, in case the webhook hasn't arrived. Only their own session counts.
 */
export async function confirmPackReturn(contractorId: string, sessionId: string): Promise<PackGrant> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return 'not-a-pack';
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.contractor_id !== contractorId) return 'not-a-pack';
  return grantPackFromSession(session);
}

/**
 * A pack's payment was refunded. A full refund takes back whatever of the
 * pack is unspent; a part refund is left for a person to decide. Payments
 * that weren't for a pack are ignored.
 */
export async function voidRefundedPack(charge: Stripe.Charge): Promise<void> {
  const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent?.id ?? null);
  if (!intentId) return;
  const admin = createServiceRoleClient();
  const { data: lot } = await admin.from('ask_token_lots').select('id, contractor_id, tokens, remaining').eq('kind', 'pack').eq('stripe_payment_intent_id', intentId).maybeSingle();
  if (!lot) return;
  if (charge.amount_refunded < charge.amount) {
    await notifyAdmins('Ask token pack part-refunded', `A token pack payment (${intentId}) was part-refunded. The tokens were left alone: ${lot.remaining} of ${lot.tokens} unspent. Contractor ${lot.contractor_id}.`);
    return;
  }
  const { error } = await admin.from('ask_token_lots').update({ remaining: 0, note: `Refunded; ${lot.remaining} unspent tokens taken back` }).eq('id', lot.id).gt('remaining', 0);
  if (error) throw new Error(`ask pack refund: ${error.message}`);
}
