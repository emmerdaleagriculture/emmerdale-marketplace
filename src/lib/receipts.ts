import type Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { MEMBERSHIP_PLANS, tierOfLookupKey } from '@/lib/stripe';

/**
 * Membership receipts (20261123120000_payment_receipts). Job payments get
 * theirs from a database trigger; a membership payment only exists in Stripe,
 * so the invoice is turned into a receipt here. Called by the webhook
 * (invoice.paid) and by the nightly premium-sync, which sweeps recent paid
 * invoices in case the live endpoint doesn't send that event. Both are safe
 * to repeat: sq_issue_receipt sends once per invoice.
 */

/**
 * Nothing paid before receipts existed is sent one now: the sweep would
 * otherwise email every member a receipt for their last payment on its first
 * night.
 */
export const RECEIPTS_FROM = Date.parse('2026-11-23T00:00:00Z');

/**
 * An invoice line as the pinned API version (2024-06-20) sends it: `price`
 * is on the line there, though newer SDK types have moved it.
 */
type Line = { price?: Stripe.Price | null; period?: { start: number; end: number }; amount: number };
const linesOf = (inv: Stripe.Invoice): Line[] =>
  ((inv.lines?.data ?? []) as unknown as Line[]);

function describe(inv: Stripe.Invoice): string {
  const lines = linesOf(inv);
  const line = lines.find((l) => l.amount > 0) ?? lines[0];
  const price = line?.price ?? null;
  const product = MEMBERSHIP_PLANS[tierOfLookupKey(price?.lookup_key)].product;
  if (inv.billing_reason === 'subscription_update') return `${product}, change of plan (prorated)`;
  const interval = price?.recurring?.interval;
  return interval === 'year' ? `${product}, annual` : interval === 'month' ? `${product}, monthly` : product;
}

export type ReceiptResult = 'issued' | 'already' | 'skipped';

export async function issueMembershipReceipt(invoice: Stripe.Invoice): Promise<ReceiptResult> {
  const inv = invoice;
  const paidAtUnix = inv.status_transitions?.paid_at ?? null;
  if (inv.status !== 'paid' || !paidAtUnix || (inv.amount_paid ?? 0) <= 0) return 'skipped';
  if (paidAtUnix * 1000 < RECEIPTS_FROM) return 'skipped';
  if (!inv.billing_reason?.startsWith('subscription')) return 'skipped';

  const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
  if (!customerId) return 'skipped';

  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('contractor_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!sub?.contractor_id) return 'skipped'; // not one of our memberships

  const { data: ct } = await admin
    .from('contractors')
    .select('email, receipt_email, contact_name, business_name')
    .eq('id', sub.contractor_id)
    .maybeSingle();
  // The accounts address when they've given one (Settings › Business details).
  const to = ct?.receipt_email || ct?.email || inv.customer_email || null;
  if (!to) return 'skipped';

  const period = linesOf(inv).find((l) => l.amount > 0)?.period;
  const { data, error } = await admin.rpc('sq_issue_receipt', {
    p_key: `stripe_invoice:${inv.id}`,
    p_receipt_no: inv.number ?? `EA-M-${inv.id!.slice(-8).toUpperCase()}`,
    p_kind: 'membership',
    p_email_kind: 'sq_membership_receipt',
    p_to_email: to,
    p_amount_pence: inv.amount_paid,
    p_paid_at: new Date(paidAtUnix * 1000).toISOString(),
    p_submission_id: null as unknown as string,
    p_contractor_id: sub.contractor_id,
    p_payload: {
      contact_name: ct?.contact_name ?? null,
      business_name: ct?.business_name ?? null,
      description: describe(inv),
      period_start: period ? new Date(period.start * 1000).toISOString() : null,
      period_end: period ? new Date(period.end * 1000).toISOString() : null,
      invoice_pdf: inv.invoice_pdf ?? null,
    },
  });
  if (error) throw new Error(`sq_issue_receipt: ${error.message}`);
  return data ? 'issued' : 'already';
}
