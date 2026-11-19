/**
 * Marketplace jobs in the contractor's books (phase 8). Customer terms 1.2:
 * the customer's contract is with Emmerdale, so the contractor's sale is to
 * Emmerdale Agriculture Online Ltd at the contractor price. Our commission is
 * never the contractor's cost and never appears here.
 *
 *   job signed off      sale: Dr 1100 Trade debtors, Cr 4000 Sales (+ 2201 VAT
 *                       inside the price when registered on that day)
 *   price changed after  the difference, as a further sale or a reduction
 *   we pay out          Dr bank, Cr 1100
 *
 * Every entry is keyed (mkt-sale:<job>, mkt-adj:<job>:<n>, mkt-payout:<id>),
 * so the sync can run any number of times. Pure: the server passes data in.
 */

import { COMPANY_LEGAL_NAME } from '@/lib/site';
import { vatInGross } from './money';
import { buildPosting, type AccountInfo, type LedgerForPosting, type Posting } from './posting';
import { registeredOn } from './vat';

export type MarketJob = {
  id: string;
  /** UK date the job was finished. */
  date: string;
  price_pence: number;
  service: string;
  postcode: string | null;
};

export type MarketPayout = { id: string; submission_id: string; amount_pence: number; paid_on: string };

/** What's already booked for each job: its sale plus any adjustments. */
export type Booked = Map<string, { total: number; adjustments: number }>;

const ref = (jobId: string) => `EA-${jobId.slice(0, 8).toUpperCase()}`;
const outcode = (pc: string | null) => (pc ?? '').trim().split(/\s+/)[0]?.toUpperCase() ?? '';

function sale(job: MarketJob, gross: number, ledger: LedgerForPosting, accounts: Map<string, AccountInfo>, external_id: string, label: string): Posting {
  const reg = registeredOn(ledger, job.date);
  const vat = reg ? vatInGross(gross, 20) : 0;
  const p = buildPosting(
    {
      kind: 'sale',
      date: job.date,
      counterparty: COMPANY_LEGAL_NAME,
      reference: ref(job.id),
      description: `${label}: ${job.service}${outcode(job.postcode) ? `, ${outcode(job.postcode)}` : ''}`,
      currency: ledger.base_currency,
      net: gross - vat,
      vat,
      gross,
      vatCode: 'STD',
      accountCode: '4000',
      paymentCode: '1100',
    },
    ledger,
    accounts,
    'marketplace',
  );
  p.entry.external_id = external_id;
  p.entry.meta = { submission_id: job.id };
  return p;
}

/** The entries to post now: new sales, price changes, and payouts for jobs whose sale is booked. */
export function marketplacePostings(
  jobs: MarketJob[],
  payouts: MarketPayout[],
  booked: Booked,
  bookedPayouts: Set<string>,
  ledger: LedgerForPosting,
  accounts: Map<string, AccountInfo>,
  bankCode: string,
  from: string,
): Posting[] {
  const out: Posting[] = [];
  const inBooks = new Set<string>();
  for (const job of jobs) {
    const had = booked.get(job.id);
    if (!had) {
      if (job.date < from || job.price_pence <= 0) continue;
      out.push(sale(job, job.price_pence, ledger, accounts, `mkt-sale:${job.id}`, 'Marketplace job'));
      inBooks.add(job.id);
      continue;
    }
    inBooks.add(job.id);
    const diff = job.price_pence - had.total;
    if (diff === 0) continue;
    const ext = `mkt-adj:${job.id}:${had.adjustments + 1}`;
    if (diff > 0) {
      out.push(sale(job, diff, ledger, accounts, ext, 'Marketplace job price increased'));
    } else {
      // A reduction: the same sale mirrored, negative so the VAT return nets it off.
      const p = sale(job, -diff, ledger, accounts, ext, 'Marketplace job price reduced');
      out.push({
        entry: { ...p.entry, net_pence: -p.entry.net_pence, vat_pence: -p.entry.vat_pence, gross_pence: -p.entry.gross_pence },
        lines: p.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      });
    }
  }
  for (const po of payouts) {
    // Only for a job whose sale is in these books: otherwise 1100 would go negative.
    if (bookedPayouts.has(po.id) || !inBooks.has(po.submission_id) || po.amount_pence <= 0) continue;
    out.push({
      entry: {
        entry_date: po.paid_on,
        kind: 'journal',
        source: 'marketplace',
        counterparty: COMPANY_LEGAL_NAME,
        reference: ref(po.submission_id),
        description: 'Payment from Emmerdale for a marketplace job',
        vat_code: 'OUTSIDE',
        net_pence: po.amount_pence,
        vat_pence: 0,
        gross_pence: po.amount_pence,
        is_capital: false,
        external_id: `mkt-payout:${po.id}`,
        meta: { submission_id: po.submission_id },
      },
      lines: [
        { code: bankCode, debit: po.amount_pence, credit: 0 },
        { code: '1100', debit: 0, credit: po.amount_pence, memo: `Job ${ref(po.submission_id)}` },
      ],
    });
  }
  return out;
}

/** Fold the marketplace entries already booked into totals per job. */
export function bookedFrom(entries: { external_id: string | null; gross_pence: number }[]): { booked: Booked; payouts: Set<string> } {
  const booked: Booked = new Map();
  const payouts = new Set<string>();
  for (const e of entries) {
    const ext = e.external_id ?? '';
    const m = ext.match(/^mkt-(sale|adj):([^:]+)/);
    if (m) {
      const b = booked.get(m[2]) ?? { total: 0, adjustments: 0 };
      b.total += e.gross_pence;
      if (m[1] === 'adj') b.adjustments += 1;
      booked.set(m[2], b);
    } else if (ext.startsWith('mkt-payout:')) payouts.add(ext.slice('mkt-payout:'.length));
  }
  return { booked, payouts };
}
