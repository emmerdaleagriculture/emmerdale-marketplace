/**
 * Where a visitor came from, as one definition.
 *
 * This lived twice and disagreed with itself: the landing-funnel page treated a
 * `gclid` as Google Ads for VIEWS but not for submissions or confirms, so every
 * Ads job landed in "(direct)" and the channel that costs money looked like it
 * produced nothing. One classifier, used by both.
 *
 * A gclid is checked first and beats utm_source, because Google Ads sets it on
 * every click whether or not the destination carries UTM parameters — it is the
 * more reliable signal, and the one the Ads account itself reconciles against.
 */

export type Attributed = {
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
};

export const UNATTRIBUTED = 'Unattributed (direct / organic)';

/** Internal hand-offs arrive as `site:<page>` — see LandingFlow's `src` param. */
const INTERNAL_PREFIX = 'site:';

const NAMED: Record<string, string> = {
  fb: 'Meta — Facebook',
  ig: 'Meta — Instagram',
  th: 'Meta — Threads',
  'hay-bales-enquiry': 'Hay-bales lead import',
};

export function channelOf(row: Attributed): string {
  if (row.gclid) return 'Google Ads';
  const src = row.utm_source?.trim();
  if (!src) return UNATTRIBUTED;
  if (NAMED[src]) return NAMED[src];
  if (src.startsWith(INTERNAL_PREFIX)) {
    return `Internal — ${src.slice(INTERNAL_PREFIX.length)} page`;
  }
  return src;
}

/**
 * Paid channels, for the spend-versus-return split. Internal hand-offs are not
 * paid: they are traffic the site already had, moving between its own pages.
 */
export function isPaid(channel: string): boolean {
  return channel === 'Google Ads' || channel.startsWith('Meta —');
}

/** Ordering: paid first (it costs money), then size, then name. */
export function compareChannels(a: string, b: string): number {
  const pa = isPaid(a) ? 0 : 1;
  const pb = isPaid(b) ? 0 : 1;
  return pa - pb || a.localeCompare(b);
}
