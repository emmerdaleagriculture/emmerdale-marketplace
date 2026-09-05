import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import {
  DEFAULT_CANCELLATION_FEE_RATE,
  cancellationSplit,
  estimateStripeFee,
  type CancellationSplit,
} from '@/lib/sealedQuotes/money';

/**
 * What a customer gets back if they cancel now (terms 9.2).
 *
 * One function so the figure quoted on the job page is the figure actually
 * refunded. Computing it twice invites the two drifting apart, and the one
 * place that must never happen is the number someone agrees to before we take
 * their money.
 *
 * Falls back to Stripe's published pricing if the real fee can't be read — a
 * page render must not fail, and a refund must not be blocked, because Stripe
 * was slow.
 */
export async function cancellationQuote(
  submissionId: string,
): Promise<(CancellationSplit & { paymentIntentId: string; amountPence: number }) | null> {
  const admin = createServiceRoleClient();

  const { data: payment } = await admin
    .from('job_payments')
    .select('amount_pence, stripe_payment_intent_id, client_quote_id')
    .eq('submission_id', submissionId)
    .eq('status', 'paid')
    .maybeSingle();
  if (!payment?.stripe_payment_intent_id) return null;

  const [{ data: quote }, { data: rateRow }] = await Promise.all([
    admin
      .from('client_quotes')
      .select('client_price_pence, contractor_quote:contractor_quotes(contractor_price_pence)')
      .eq('id', payment.client_quote_id)
      .maybeSingle(),
    admin.from('app_config').select('value').eq('key', 'sq_cancellation_fee_rate').maybeSingle(),
  ]);

  const contractorPrice =
    (quote?.contractor_quote as { contractor_price_pence: number } | null)
      ?.contractor_price_pence ?? null;
  // No contractor price means no known margin. Charge nothing but the
  // processing fee rather than guessing at a number we'd be keeping.
  const margin =
    contractorPrice === null ? 0 : (quote?.client_price_pence ?? 0) - contractorPrice;

  const rate = Number(rateRow?.value ?? DEFAULT_CANCELLATION_FEE_RATE);

  let stripeFee = estimateStripeFee(payment.amount_pence);
  try {
    const pi = await getStripe().paymentIntents.retrieve(payment.stripe_payment_intent_id, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = pi.latest_charge as { balance_transaction?: { fee?: number } } | null;
    if (typeof charge?.balance_transaction?.fee === 'number') {
      stripeFee = charge.balance_transaction.fee;
    }
  } catch {
    /* published pricing it is */
  }

  return {
    ...cancellationSplit(
      payment.amount_pence,
      margin,
      stripeFee,
      Number.isFinite(rate) ? rate : DEFAULT_CANCELLATION_FEE_RATE,
    ),
    paymentIntentId: payment.stripe_payment_intent_id,
    amountPence: payment.amount_pence,
  };
}
