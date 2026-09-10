import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

/**
 * What a customer gets back if they cancel now (terms 9.1/9.2).
 *
 * One function so the figure quoted on the job page is the figure actually
 * refunded. Computing it twice invites the two drifting apart, and the one
 * place that must never happen is the number someone agrees to before we keep
 * their money.
 *
 * The arithmetic itself lives in SQL (sq_cancellation_split) alongside the
 * config rate, because the fee is now a share of the price rather than
 * something assembled from a margin and a live Stripe fee lookup. What is left
 * here is the Stripe side: finding the intent a refund can actually be issued
 * against.
 */
export type CancellationQuote = {
  /** Retained — the deposit, or its equivalent share of the price. */
  fee: number;
  /** Refunded to the card. Zero when only the deposit has been paid. */
  refund: number;
  totalPence: number;
  paidPence: number;
  /** Null when there is nothing to refund — a deposit-only cancellation. */
  paymentIntentId: string | null;
};

export async function cancellationQuote(
  submissionId: string,
): Promise<CancellationQuote | null> {
  const admin = createServiceRoleClient();

  const { data: split } = await admin.rpc('sq_cancellation_split', {
    p_submission_id: submissionId,
  });
  const s = split as
    | { ok: boolean; total_pence: number; paid_pence: number; fee_pence: number; refund_pence: number }
    | null;
  if (!s?.ok) return null;

  const base = {
    fee: s.fee_pence,
    refund: s.refund_pence,
    totalPence: s.total_pence,
    paidPence: s.paid_pence,
  };
  // Nothing going back means no intent is needed, and looking one up would
  // only invent a way for a cancellation to fail.
  if (s.refund_pence <= 0) return { ...base, paymentIntentId: null };

  const { data: payment } = await admin
    .from('job_payments')
    .select('stripe_payment_intent_id, stripe_checkout_session_id')
    .eq('submission_id', submissionId)
    .eq('kind', 'deposit')
    .eq('status', 'paid')
    .maybeSingle();
  if (!payment) return null;

  // Payments taken before the webhook stored the intent have only a session.
  // Recovering it costs one call and is the difference between a customer
  // being able to cancel and being told their payment cannot be found.
  let intentId = payment.stripe_payment_intent_id;
  if (!intentId && payment.stripe_checkout_session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(
        payment.stripe_checkout_session_id,
      );
      intentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      if (intentId) {
        await admin
          .from('job_payments')
          .update({ stripe_payment_intent_id: intentId })
          .eq('stripe_checkout_session_id', payment.stripe_checkout_session_id);
      }
    } catch (err) {
      console.error('[sq] could not recover the payment intent:', err);
    }
  }
  if (!intentId) return null;

  return { ...base, paymentIntentId: intentId };
}
