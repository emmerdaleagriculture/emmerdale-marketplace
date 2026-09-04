'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { isTokenFormat } from '@/lib/sealedQuotes/tokens';
import type { FormState } from '@/lib/form';

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export type AcceptActionState = FormState;

/**
 * Accept a price (§27): create the Stripe Checkout session FIRST (a failed
 * Stripe call must never strand the job in accepted_awaiting_payment), then
 * the transactional begin_acceptance RPC; on an RPC conflict the session is
 * expired as cleanup. Award happens only when the payment webhook fires.
 *
 * Retry after an expired link is the same action — one tap, never a fresh
 * decision: the RPC re-accepts the same quote and a fresh session is minted.
 */
export async function acceptQuoteAction(
  _prev: AcceptActionState,
  formData: FormData,
): Promise<AcceptActionState> {
  const token = String(formData.get('token') ?? '');
  const quoteId = String(formData.get('client_quote_id') ?? '');
  if (!isTokenFormat(token) || !quoteId) return { error: 'Something went wrong — refresh and try again.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('id, status, contact_email, accepted_client_quote_id, service:services(name)')
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  if (!js) return { error: 'This link is no longer valid.' };

  // Retry path: a live pending payment for this quote → reuse its link.
  if (js.status === 'accepted_awaiting_payment' && js.accepted_client_quote_id === quoteId) {
    const { data: pay } = await admin
      .from('job_payments')
      .select('stripe_checkout_session_id, status, expires_at')
      .eq('submission_id', js.id)
      .eq('client_quote_id', quoteId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pay) {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(pay.stripe_checkout_session_id);
      if (session.url) redirect(session.url);
    }
    // No live link (expired but sweep hasn't voided yet): void it now so a
    // fresh acceptance can proceed.
    const { data: stale } = await admin
      .from('job_payments')
      .select('stripe_checkout_session_id')
      .eq('submission_id', js.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stale) await admin.rpc('void_acceptance', { p_session_id: stale.stripe_checkout_session_id });
  }

  const { data: quote } = await admin
    .from('client_quotes')
    .select('id, client_price_pence, contractor_display_label, status, valid_until')
    .eq('id', quoteId)
    .eq('submission_id', js.id)
    .maybeSingle();
  if (!quote) return { error: 'That price is no longer available.' };

  const serviceName = (js.service as { name: string } | null)?.name ?? 'Land work';
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600 - 120; // Stripe caps at exactly 24h

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error('[sq] Stripe not configured:', err);
    return {
      error:
        'Payments aren’t available just now — nothing was booked. Please try again shortly.',
    };
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: quote.client_price_pence,
          product_data: {
            name: `${serviceName} — ${quote.contractor_display_label}`,
          },
        },
        quantity: 1,
      },
    ],
    expires_at: expiresAt,
    customer_email: js.contact_email ?? undefined,
    metadata: { kind: 'sq_job_payment', submission_id: js.id, client_quote_id: quote.id },
    payment_intent_data: {
      metadata: { kind: 'sq_job_payment', submission_id: js.id, client_quote_id: quote.id },
    },
    success_url: `${SITE()}/my/${token}?paid=1`,
    cancel_url: `${SITE()}/my/${token}`,
  });

  const { data, error } = await admin.rpc('begin_acceptance', {
    p_client_token: token,
    p_client_quote_id: quote.id,
    p_session_id: session.id,
    p_session_expires_at: new Date(expiresAt * 1000).toISOString(),
    p_checkout_url: session.url ?? `${SITE()}/my/${token}`,
  });
  if (error || !(data as { ok: boolean }).ok) {
    // Cleanup: never leave a payable session for an acceptance that didn't take.
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch { /* already expired/paid — the webhook path handles it */ }
    const reason = (data as { reason?: string } | null)?.reason;
    if (reason === 'conflict') {
      return { error: 'This job already has an acceptance in progress — refresh to see where things stand.' };
    }
    if (reason === 'quote_unavailable') {
      return { error: `That price is no longer available — it may have lapsed. The list below is current.` };
    }
    console.error('[sq] begin_acceptance failed:', error, data);
    return { error: 'Something went wrong — nothing was booked and no money was taken. Please try again.' };
  }

  redirect(session.url ?? `${SITE()}/my/${token}`);
}

export async function submitRatingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const stars = Number(formData.get('stars'));
  const comment = String(formData.get('comment') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is no longer valid.' };
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { error: 'Pick a star rating first.' };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('submit_client_rating', {
    p_client_token: token,
    p_stars: stars,
    p_comment: comment.slice(0, 1000),
  });
  if (error) {
    console.error('[sq] submit_client_rating failed:', error);
    return { error: 'That didn’t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) {
    if (res.reason === 'already_rated') return { ok: true, message: 'You’ve already rated this job — thank you.' };
    if (res.reason === 'not_completed') return { error: 'You can rate once the work is done.' };
    return { error: 'This link is no longer valid.' };
  }
  return { ok: true, message: 'Thank you — your rating helps the next customer choose.' };
}

/**
 * The customer's half of completion (§25). Only valid from
 * completed_by_contractor — confirming means agreeing with the contractor's
 * claim, so there has to be one. The admin override remains for a customer
 * who never comes back, so a contractor is never stranded by silence.
 */
export async function confirmCompletionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  if (!isTokenFormat(token)) return { error: 'This link is no longer valid.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('id')
    .eq('client_token', token)
    .is('client_token_revoked_at', null)
    .maybeSingle();
  if (!js) return { error: 'This link is no longer valid.' };

  const { data, error } = await admin.rpc('confirm_completion_by_client', {
    p_submission_id: js.id,
  });
  if (error) {
    console.error('[sq] confirm_completion_by_client failed:', error);
    return { error: 'That didn\u2019t go through — please try again.' };
  }
  const res = data as { ok: boolean; reason?: string };
  if (!res.ok) return { error: 'This job has moved on — refresh to see where it is.' };

  revalidatePath(`/my/${token}`);
  return { ok: true, message: 'Confirmed — thank you. Your contractor will be paid.' };
}
