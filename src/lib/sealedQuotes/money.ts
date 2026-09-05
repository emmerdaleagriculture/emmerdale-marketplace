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
 * Cancellation fee (terms 9.2 and the Cancellation Schedule): we retain 15%
 * and refund 85%. Here rather than beside the action so the page can quote the
 * customer the exact figure before they commit to it.
 */
export const CANCELLATION_FEE_RATE = 0.15;

export function cancellationSplit(pricePence: number): { fee: number; refund: number } {
  const fee = Math.round(pricePence * CANCELLATION_FEE_RATE);
  return { fee, refund: pricePence - fee };
}
