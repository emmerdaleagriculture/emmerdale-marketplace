/**
 * Daily sync of a contractor's Stripe balance into their books (Tally 3.8),
 * through the 1220 Stripe balance clearing account so payouts are transfers,
 * not income. Every entry carries the balance transaction id, so a re-run
 * books nothing twice.
 *
 *   invoice card payment   already booked when paid (Dr 1220 / Cr 1100); fee only
 *   other card payment     Dr 1220, Cr 4000 (+ Cr 2201 at gross ÷ 6 if registered)
 *   fee                    Dr 6800 Bank charges, Cr 1220
 *   refund                 the reverse of a sale
 *   payout                 Dr 1200 Bank, Cr 1220 (a failed payout reverses it)
 *   anything else          4900 Other income / 6990 General expenses, to check
 */

import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { roundDiv } from './money';
import { registeredOn } from './vat';
import type { Line } from './posting';
import type { Ledger } from './server';

type Entry = {
  entry_date: string;
  kind: 'sale' | 'purchase' | 'journal';
  source: 'stripe';
  counterparty: string;
  reference: string;
  description: string;
  vat_code: string;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  external_id: string;
};

const ukDay = (unix: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(unix * 1000));

/** Entries for one balance transaction (pure). */
export function postingsFor(t: Stripe.BalanceTransaction, ledger: Pick<Ledger, 'vat_registered' | 'vat_registration_date' | 'vat_scheme'>): { entry: Entry; lines: Line[] }[] {
  if (t.currency !== 'gbp') return [];
  const date = ukDay(t.created);
  const base = { entry_date: date, source: 'stripe' as const, counterparty: 'Stripe', reference: t.id };
  const out: { entry: Entry; lines: Line[] }[] = [];
  const src = typeof t.source === 'object' && t.source ? (t.source as Stripe.Charge) : null;
  const isInvoice = Boolean(src && 'metadata' in src && src.metadata?.books_invoice);
  const registered = registeredOn(
    { vat_registered: ledger.vat_registered, vat_registration_date: ledger.vat_registration_date, vat_scheme: ledger.vat_scheme as 'standard' },
    date,
  );
  const flat = ledger.vat_scheme === 'flat_rate';

  const sale = (gross: number, desc: string, ext: string) => {
    const vat = registered && !flat ? roundDiv(gross, 6) : 0;
    const lines: Line[] = [
      { code: '1220', debit: gross, credit: 0 },
      { code: '4000', debit: 0, credit: gross - vat },
      { code: '2201', debit: 0, credit: vat },
    ];
    out.push({
      entry: { ...base, kind: 'sale', description: desc, vat_code: registered ? 'STD' : 'NOVAT', net_pence: gross - vat, vat_pence: vat, gross_pence: gross, external_id: ext },
      lines: lines.filter((l) => l.debit > 0 || l.credit > 0),
    });
  };

  switch (t.type) {
    case 'charge':
    case 'payment':
      if (!isInvoice && t.amount > 0) sale(t.amount, `Card payment${t.description ? `: ${t.description}` : ''}`, `stripe:${t.id}`);
      break;
    case 'refund':
    case 'payment_refund': {
      const gross = t.amount; // negative
      const vat = registered && !flat ? -roundDiv(-gross, 6) : 0;
      out.push({
        entry: { ...base, kind: 'sale', description: 'Card refund', vat_code: registered ? 'STD' : 'NOVAT', net_pence: gross - vat, vat_pence: vat, gross_pence: gross, external_id: `stripe:${t.id}` },
        lines: [
          { code: '4000', debit: -gross + vat, credit: 0 },
          { code: '2201', debit: -vat, credit: 0 },
          { code: '1220', debit: 0, credit: -gross },
        ].filter((l) => l.debit > 0 || l.credit > 0),
      });
      break;
    }
    case 'payout':
      out.push({
        entry: { ...base, kind: 'journal', description: 'Stripe payout to bank', vat_code: 'OUTSIDE', net_pence: -t.amount, vat_pence: 0, gross_pence: -t.amount, external_id: `stripe:${t.id}` },
        lines: [
          { code: '1200', debit: -t.amount, credit: 0 },
          { code: '1220', debit: 0, credit: -t.amount },
        ],
      });
      break;
    case 'payout_failure':
    case 'payout_cancel':
      out.push({
        entry: { ...base, kind: 'journal', description: 'Stripe payout returned', vat_code: 'OUTSIDE', net_pence: t.amount, vat_pence: 0, gross_pence: t.amount, external_id: `stripe:${t.id}` },
        lines: [
          { code: '1220', debit: t.amount, credit: 0 },
          { code: '1200', debit: 0, credit: t.amount },
        ],
      });
      break;
    default:
      if (t.amount !== 0 && t.type !== 'stripe_fee') {
        const inn = t.amount > 0;
        out.push({
          entry: { ...base, kind: inn ? 'sale' : 'purchase', description: `Stripe ${t.type.replace(/_/g, ' ')} (check this)`, vat_code: 'OUTSIDE', net_pence: Math.abs(t.amount), vat_pence: 0, gross_pence: Math.abs(t.amount), external_id: `stripe:${t.id}` },
          lines: inn
            ? [{ code: '1220', debit: t.amount, credit: 0 }, { code: '4900', debit: 0, credit: t.amount }]
            : [{ code: '6990', debit: -t.amount, credit: 0 }, { code: '1220', debit: 0, credit: -t.amount }],
        });
      }
  }
  // Stripe's fee on any transaction, and Stripe's own fee transactions.
  const fee = t.type === 'stripe_fee' ? -t.amount : t.fee;
  if (fee > 0) {
    out.push({
      entry: { ...base, kind: 'purchase', counterparty: 'Stripe', description: 'Stripe fee', vat_code: 'EXEMPT', net_pence: fee, vat_pence: 0, gross_pence: fee, external_id: `stripe-fee:${t.id}` },
      lines: [
        { code: '6800', debit: fee, credit: 0 },
        { code: '1220', debit: 0, credit: fee },
      ],
    });
  }
  return out;
}

/** Sync one ledger's connected account since its last sync (3 days' overlap). */
export async function syncLedgerStripe(ledger: Ledger): Promise<{ posted: number; seen: number }> {
  if (!ledger.stripe_account_id || !ledger.stripe_charges_enabled) return { posted: 0, seen: 0 };
  const admin = createServiceRoleClient();
  const since = ledger.stripe_synced_at ?? ledger.stripe_connected_at ?? new Date().toISOString();
  const gte = Math.floor((Date.parse(since) - 3 * 86_400_000) / 1000);
  let posted = 0;
  let seen = 0;
  const list = getStripe().balanceTransactions.list(
    { created: { gte }, limit: 100, expand: ['data.source'] },
    { stripeAccount: ledger.stripe_account_id },
  );
  for await (const t of list) {
    seen += 1;
    for (const p of postingsFor(t, ledger)) {
      const { data: existing } = await admin.from('books_entries').select('id').eq('ledger_id', ledger.id).eq('external_id', p.entry.external_id).maybeSingle();
      if (existing) continue;
      const { error } = await admin.rpc('books_post_entry', {
        p_ledger_id: ledger.id,
        p_entry: p.entry as unknown as Json,
        p_lines: p.lines as unknown as Json,
      });
      if (error) console.error('[books] stripe sync post failed', { ledger: ledger.id, txn: t.id, error: error.message });
      else posted += 1;
    }
  }
  await admin.from('books_ledgers').update({ stripe_synced_at: new Date().toISOString() }).eq('id', ledger.id);
  return { posted, seen };
}
