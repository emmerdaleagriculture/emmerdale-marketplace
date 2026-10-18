/**
 * What a customer is told about where their job is, in their words not the
 * state machine's. One list, read by /my and the app's home screen.
 */
export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  confirmed: 'Just sent',
  distributed: 'Out to contractors',
  quotes_receiving: 'Prices coming in',
  accepted_awaiting_payment: 'Waiting for your deposit',
  awarded: 'Booked',
  contacted: 'Contractor in touch',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Awaiting your confirmation',
  completed: 'Done',
  paid: 'Done — paid in full',
  no_matches: 'No contractors covered it',
  no_quotes: 'Nobody priced it',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** Jobs that are still live from the customer's point of view. */
export const CUSTOMER_LIVE_STATUSES = new Set([
  'confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment',
  'awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor',
]);

/** "Good morning" / "Good afternoon" / "Good evening", by the UK clock. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
