/** Client-safe labels for the Council tenders page (no server imports). */

export const TENDER_STATUSES = ['interested', 'bidding', 'submitted', 'won', 'lost', 'no_bid'] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const STATUS_LABEL: Record<TenderStatus, string> = {
  interested: 'Interested',
  bidding: 'Bidding',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  no_bid: 'Not for me',
};

export const FIT_LABEL: Record<string, string> = {
  rural: 'Rural work',
  grounds: 'Grounds maintenance',
  unsure: 'Land work',
};

export const KIND_LABEL: Record<string, string> = {
  open: 'Open tender',
  pipeline: 'Early notice',
  renewal: 'Up for renewal',
};

/** "£12,000", "£12,000–£30,000", or null. */
export function valueRange(low: number | null, high: number | null): string | null {
  const f = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
  if (low && high && low !== high) return `${f(low)}–${f(high)}`;
  if (high || low) return f((high || low)!);
  return null;
}
