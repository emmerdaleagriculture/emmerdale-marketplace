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
  /**
   * page_events stores a flag rather than the click id — it is a behavioural
   * table that promises to hold nothing identifying. Same meaning as `gclid`
   * being present, so the classifier treats them alike.
   */
  has_gclid?: boolean | null;
  /**
   * The external page that sent them, when known. Consulted only when there
   * is no ad tag, or when the only tag is an internal hand-off (`site:*`):
   * then the referrer is the better answer to "where did they come from".
   */
  referrer?: string | null;
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

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|search\.brave|startpage|yandex)\./;
const FACEBOOK = /(^|\.)(facebook\.com|fb\.com|fb\.me)$/;
const INSTAGRAM = /(^|\.)instagram\.com$/;
const OWN = /(^|\.)emmerdaleagriculture\.com$/;

/**
 * A source value from an external referrer, or '' when it says nothing
 * (none, unparseable, or one of our own pages). Shared by the browser, which
 * stores it on a submission, and the reports, which apply it to landing
 * views recorded before that happened.
 */
export function sourceFromReferrer(referrer: string | null | undefined): string {
  if (!referrer?.trim()) return '';
  let host: string;
  try {
    host = new URL(referrer).host.toLowerCase();
  } catch {
    return '';
  }
  // Android apps report themselves as android-app://com.google.android.gm etc.
  if (referrer.startsWith('android-app://')) host = referrer.slice(14).split('/')[0];
  // Our own pages, and a dev server's, are not a source.
  if (!host || OWN.test(host) || /^(localhost|127\.0\.0\.1)(:|$)/.test(host)) return '';
  if (SEARCH.test(host) || host === 'com.google.android.googlequicksearchbox') return 'search';
  if (FACEBOOK.test(host)) return 'social:facebook';
  if (INSTAGRAM.test(host)) return 'social:instagram';
  return `ref:${host.replace(/^www\./, '')}`;
}

function labelOf(src: string): string {
  if (NAMED[src]) return NAMED[src];
  if (src === 'search') return 'Organic search';
  // Arrived from Facebook or Instagram without our ad tags: an unpaid post,
  // a share, or an ad whose tags were lost. Kept apart from the tagged ads.
  if (src === 'social:facebook') return 'Facebook — untagged';
  if (src === 'social:instagram') return 'Instagram — untagged';
  if (src.startsWith('ref:')) return `Referral — ${src.slice(4)}`;
  if (src.startsWith(INTERNAL_PREFIX)) {
    return `Internal — ${src.slice(INTERNAL_PREFIX.length)} page`;
  }
  return src;
}

export function channelOf(row: Attributed): string {
  if (row.gclid || row.has_gclid) return 'Google Ads';
  const src = row.utm_source?.trim() ?? '';
  // No tag, or only our own hand-off tag: the referrer knows more.
  if (!src || src.startsWith(INTERNAL_PREFIX)) {
    const fromReferrer = sourceFromReferrer(row.referrer);
    if (fromReferrer) return labelOf(fromReferrer);
  }
  if (!src) return UNATTRIBUTED;
  return labelOf(src);
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
