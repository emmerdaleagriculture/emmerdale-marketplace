/**
 * Ops board dwell thresholds (spec v1.6 §30 view 1) — what makes the board
 * actionable rather than decorative. Tune here; the board reads this table.
 */

export type OpsState =
  | 'confirmed'
  | 'distributed'
  | 'quotes_receiving'
  | 'accepted_awaiting_payment'
  | 'awarded'
  | 'contacted'
  | 'scheduled'
  | 'in_progress'
  | 'completed_by_contractor'
  | 'disputed'
  | 'variation_declined';

const HOUR = 60 * 60 * 1000;

/** Milliseconds in-state after which a job is flagged; null = never flagged. */
export const OPS_THRESHOLDS_MS: Record<OpsState, number | null> = {
  confirmed: 15 * 60 * 1000, // not distributed within 15 minutes
  distributed: 48 * HOUR, // no quotes within 48 hours
  quotes_receiving: null,
  accepted_awaiting_payment: 12 * HOUR,
  awarded: 24 * HOUR, // no first contact within 24 hours (§25)
  contacted: null,
  scheduled: 24 * HOUR, // past its date, not started — same day
  in_progress: null,
  completed_by_contractor: 3 * 24 * HOUR, // unconfirmed 3 days (auto-confirm at 5, Part 3)
  disputed: 4 * HOUR,
  variation_declined: 4 * HOUR,
};

export function isOverdue(state: string, enteredAt: string | Date, now = new Date()): boolean {
  const threshold = OPS_THRESHOLDS_MS[state as OpsState];
  if (threshold == null) return false;
  const entered = typeof enteredAt === 'string' ? new Date(enteredAt) : enteredAt;
  return now.getTime() - entered.getTime() > threshold;
}
