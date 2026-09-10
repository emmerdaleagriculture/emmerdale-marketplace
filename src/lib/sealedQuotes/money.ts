/**
 * Money for the sealed-quote funnel. Everything is pence integers; the
 * canonical markup computation lives in SQL (client_price_pence()) — this TS
 * twin exists for display and tests, and a fixture test keeps the two in
 * lockstep.
 */

/**
 * Client price = contractor price × (1 + rate), rounded UP to the nearest £5
 * (spec §18: deterministic, applied once at creation, stored).
 * Integer-exact: no floating-point drift for any realistic price.
 */
export function computeClientPricePence(contractorPence: number, rate = 0.1): number {
  if (!Number.isInteger(contractorPence) || contractorPence <= 0) {
    throw new Error('contractorPence must be a positive integer');
  }
  // rate as an exact rational: 0.1 → 1/10 via a scaled integer numerator.
  const SCALE = 1_000_000;
  const rateScaled = Math.round(rate * SCALE);
  const raw = contractorPence * (SCALE + rateScaled); // pence × SCALE
  const marked = Math.ceil(raw / SCALE);
  return Math.ceil(marked / 500) * 500;
}

/** "£1,250" — pence shown only when non-zero ("£1,252.50"). */
export function formatGBP(pence: number): string {
  const pounds = pence / 100;
  const hasPence = pence % 100 !== 0;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: hasPence ? 2 : 0,
  }).format(pounds);
}

/** "£90/acre (£250 minimum)" */
export function formatRate(ratePence: number, minimumPence: number | null): string {
  const rate = `${formatGBP(ratePence)}/acre`;
  return minimumPence ? `${rate} (${formatGBP(minimumPence)} minimum)` : rate;
}

/**
 * Parse a price typed into a form ("450", "£450.50", "1,200") into pence.
 * Null when it isn't a usable positive amount.
 */
export function poundsInputToPence(raw: string): number | null {
  const cleaned = raw.trim().replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence > 0 ? pence : null;
}

/**
 * The deposit / balance split (terms 7.2).
 *
 * TS twin of sq_deposit_pence(). SQL is canonical — the server action reads
 * the plan from sq_payment_plan() before opening a Checkout session, and
 * begin_acceptance re-derives it and refuses a mismatch. This exists for
 * display and for the fixture test that keeps the two in lockstep.
 *
 * round(), not ceil-to-£5 like computeClientPricePence: two amounts that have
 * to sum back to the price exactly cannot both be rounded outward.
 */
export const DEFAULT_DEPOSIT_RATE = 0.15;

export type DepositSplit = { deposit: number; balance: number };

export function depositSplitPence(
  totalPence: number,
  rate: number = DEFAULT_DEPOSIT_RATE,
): DepositSplit {
  if (!Number.isInteger(totalPence) || totalPence < 0) {
    throw new Error('totalPence must be a non-negative integer');
  }
  const deposit = Math.min(Math.max(Math.round(totalPence * rate), 0), totalPence);
  return { deposit, balance: totalPence - deposit };
}

/**
 * Cancellation before work starts (terms 9.1/9.2): the deposit is the fee.
 *
 * It used to be 15% of our MARGIN plus the Stripe fee, refunding the rest —
 * arithmetic that only made sense while the customer had handed over the whole
 * price up front. Now they put down 15% and that is what they forfeit, so the
 * fee is a share of the price and the refund is whatever they paid above it
 * (normally nothing, and everything above the deposit while sq_deposit_rate is
 * still 1.0 for the rollout).
 */
export const DEFAULT_CANCELLATION_FEE_RATE = 0.15;

export type CancellationSplit = {
  /** Retained: the deposit, or its equivalent share of the price. */
  fee: number;
  /** Refunded to the customer's card — zero once only a deposit has been paid. */
  refund: number;
};

export function cancellationSplit(
  totalPence: number,
  paidPence: number,
  rate: number = DEFAULT_CANCELLATION_FEE_RATE,
): CancellationSplit {
  // Never keep more than they actually handed over.
  const fee = Math.min(Math.max(Math.round(Math.max(0, totalPence) * rate), 0), Math.max(0, paidPence));
  return { fee, refund: Math.max(0, paidPence) - fee };
}
