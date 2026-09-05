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
 * Cancellation fee (terms 9.2 and the Cancellation Schedule).
 *
 * Charged on OUR MARGIN, not on the whole price. 15% of the gross would retain
 * more than the job earns — £9,075 against a £5,500 margin on a £60,500 job —
 * which is a penalty, not a pre-estimate of loss.
 *
 * The Stripe fee is added because Stripe keeps it on a refund. Without it the
 * fee is 1.36% of the gross against a 1.5% + 20p charge, so every cancellation
 * would lose money on every job size. Each part is a cost actually incurred,
 * which is what makes the total defensible rather than arbitrary.
 */
export const DEFAULT_CANCELLATION_FEE_RATE = 0.15;

export type CancellationSplit = {
  /** Retained: the share of margin, plus the processing fee Stripe keeps. */
  fee: number;
  /** Refunded to the customer's card. */
  refund: number;
  marginShare: number;
  stripeFee: number;
};

export function cancellationSplit(
  pricePence: number,
  marginPence: number,
  stripeFeePence: number,
  rate: number = DEFAULT_CANCELLATION_FEE_RATE,
): CancellationSplit {
  // Never more than the margin itself, whatever the rate is set to, and never
  // negative on a job priced at or below cost.
  const marginShare = Math.max(0, Math.round(Math.max(0, marginPence) * rate));
  const stripeFee = Math.max(0, Math.round(stripeFeePence));
  // The refund can never exceed what they paid, and the fee can never swallow
  // the whole payment: a customer is always refunded something.
  const fee = Math.min(marginShare + stripeFee, Math.max(0, pricePence));
  return { fee, refund: pricePence - fee, marginShare, stripeFee };
}

/** Stripe's UK card pricing, used only when the real figure can't be read. */
export function estimateStripeFee(pricePence: number): number {
  return Math.round(pricePence * 0.015) + 20;
}
