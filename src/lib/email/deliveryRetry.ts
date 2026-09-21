/**
 * Whether a message that never arrived is worth sending again, and when.
 *
 * Kept apart from the webhook that calls it because this is the whole of the
 * judgement — everything else there is bookkeeping — and because getting it
 * wrong is expensive in both directions. Retry too little and a customer
 * silently never hears from us, which is what used to happen to all of them.
 * Retry too much and we hammer an address that is refusing us, which costs
 * sender reputation and buries the real failures underneath.
 */

export type Delivery =
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'delayed'
  | 'failed'
  | 'suppressed';

export type BounceInfo = { type?: string; subType?: string } | undefined;

/**
 * Permanent means the address is wrong, not that the mailbox was briefly
 * full. Resend reports it as bounce.type and calls the rest Transient.
 *
 * An unclassified bounce comes back false — not hard — so it is retried and
 * the address is not written off. That is the lenient direction, chosen to
 * match what `record_undeliverable_email` already does: it too only blocks an
 * address on a bounce Resend actually called Permanent. Retrying a dead
 * address twice costs a little sender reputation; blocking a live one on a
 * bounce nobody classified costs a contractor every email we ever send them.
 */
export function isHardBounce(bounce: BounceInfo): boolean {
  const type = (bounce?.type ?? '').toLowerCase();
  const sub = (bounce?.subType ?? '').toLowerCase();
  if (type === 'transient' || type === 'undetermined') return false;
  return type === 'permanent' || sub.includes('nonexistent') || sub.includes('suppressed');
}

/**
 * A failure about the moment rather than the address.
 *
 * `failed` is the provider saying it could not send at all, which says
 * nothing about the recipient — six real emails were lost to one such minute
 * on 15 Sep 2026. A Transient bounce is the recipient's server refusing today
 * and inviting us back.
 *
 * Everything else is deliberately not retried. `delayed` is Resend still
 * trying, and our own second copy would race its; `complained` is someone
 * asking us to stop; `suppressed` and a Permanent bounce are the address
 * itself being wrong, which waiting does not fix.
 */
export function isWorthRetrying(status: Delivery, bounce: BounceInfo): boolean {
  if (status === 'failed') return true;
  if (status === 'bounced') return !isHardBounce(bounce);
  return false;
}

/** Three attempts in total. */
export const MAX_DELIVERY_RETRIES = 2;

const RETRY_DELAYS_MS = [15 * 60 * 1000, 4 * 60 * 60 * 1000];

/**
 * How long to hold the next attempt back, or null once they are spent.
 *
 * The first wait is short because the commonest cause is a provider blip
 * that is over in seconds; the second is hours, because by then the likely
 * cause is a mailbox that is full and needs someone to empty it. Sending the
 * retry on the next drain — sixty seconds later — would fail for exactly the
 * reason the first one did.
 */
export function retryDelayMs(attemptsSoFar: number): number | null {
  if (attemptsSoFar >= MAX_DELIVERY_RETRIES) return null;
  return RETRY_DELAYS_MS[attemptsSoFar] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

/** "in 15 minutes" / "in 4 hours", for the admin alert. */
export function describeDelay(ms: number): string {
  return ms >= 60 * 60 * 1000
    ? `in ${Math.round(ms / 3600000)} hours`
    : `in ${Math.round(ms / 60000)} minutes`;
}
