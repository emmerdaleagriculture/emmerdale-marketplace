/**
 * Filters for /admin/submissions that reproduce a number on the dashboard, so
 * a tile on /admin/metrics opens the jobs behind it. Each rule mirrors its
 * count in admin_dashboard() — change one, change the other.
 */

export const SUBMISSION_FILTERS = {
  started: 'Started a job — last 30 days',
  sent: 'Sent it — last 30 days',
  reached: 'Reached contractors — last 30 days',
  priced: 'Got a price — last 30 days',
  paid: 'Paid — last 30 days',
  completed: 'Completed — last 30 days',
  awaiting_confirm: 'Awaiting customer confirmation',
  awaiting_payment: 'Accepted, deposit not paid',
  no_quotes_48h: 'No price after 48h',
  no_matches: 'No contractor covered it',
} as const;

export type SubmissionFilter = keyof typeof SUBMISSION_FILTERS;

export function isSubmissionFilter(v: unknown): v is SubmissionFilter {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SUBMISSION_FILTERS, v);
}

type FilterRow = {
  id: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  distributed_at: string | null;
};

/** Submission ids with a client quote, and with a taken payment. */
export type FilterIds = { priced: Set<string | null>; paid: Set<string | null> };

const DAY = 24 * 60 * 60 * 1000;

export function matchesFilter(r: FilterRow, filter: SubmissionFilter, ids: FilterIds, now = Date.now()): boolean {
  const since30 = now - 30 * DAY;
  // The dashboard's "job": a submission the customer sent, not a draft.
  const sent =
    r.status !== 'draft' &&
    r.status !== 'abandoned' &&
    r.confirmed_at != null &&
    Date.parse(r.confirmed_at) >= since30;

  switch (filter) {
    case 'started': return Date.parse(r.created_at) >= since30;
    case 'sent': return sent;
    case 'reached': return sent && r.status !== 'confirmed' && r.status !== 'no_matches';
    case 'priced': return sent && ids.priced.has(r.id);
    case 'paid': return sent && ids.paid.has(r.id);
    case 'completed': return sent && (r.status === 'completed' || r.status === 'paid');
    case 'awaiting_confirm': return r.status === 'completed_by_contractor';
    case 'awaiting_payment': return r.status === 'accepted_awaiting_payment';
    case 'no_matches': return r.status === 'no_matches';
    case 'no_quotes_48h':
      return r.status === 'distributed' && r.distributed_at != null && Date.parse(r.distributed_at) < now - 2 * DAY;
  }
}
