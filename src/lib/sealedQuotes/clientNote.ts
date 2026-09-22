/**
 * The contractor's note that goes to the customer, checked before it is stored.
 *
 * This is the only contractor-authored free text a customer ever sees, and
 * nothing reviews it: submit_contractor_quote publishes in the same
 * transaction that stores it. Three things must not get through.
 *
 * - **Their own price.** The customer is looking at contractor price +
 *   sq_markup_rate. "£400 all in" on a quote showing £440 hands them the
 *   margin.
 * - **A way to reach them.** Identity is masked as "Contractor A" until the
 *   job is awarded and paid for — a phone number or an email in the note
 *   walks straight round that, and round clause 8 of the contractor terms.
 * - **Links.** Same reason, and the email renderer linkifies anything
 *   URL-shaped, so a link that reached an email would be clickable.
 *
 * We refuse rather than silently strip: a contractor who thinks the customer
 * read something they never saw is worse off than one who is told to reword
 * it. Judgement calls we deliberately let through — a bare "400", "2 acres",
 * "24 hours" — are why admin can clear a published note.
 */

export const CLIENT_NOTE_MAX = 200;

const LINK = /\bhttps?:\/\/|\bwww\./i;
/** A bare domain, but only for endings that are not ordinary words. */
const DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:co\.uk|com|net|org|uk|io|co)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/**
 * Any mention of money, not just a digit followed by one: "four hundred
 * pounds" is the figure too. A legitimate note has no business naming an
 * amount at all — that is what the price box is for — so the currency words
 * are blocked outright rather than only when a numeral is next to them.
 * Bare digits stay legal: "2 acres", "24 hours", "3 metres".
 */
const MONEY = /£|\bquid\b|\bgbp\b|\bpounds?\b/i;

/**
 * UK-shaped phone numbers, after separators are removed so "07123 456 789"
 * and "07123456789" read alike. +44…, 0… of 10-11 digits, or a bare 11-digit
 * run. Deliberately not matching shorter digit runs: acreages and dates.
 */
function hasPhoneNumber(note: string): boolean {
  const digits = note.replace(/[\s().\-–—]/g, '');
  return /(?:\+44|0044)\d{9,10}/.test(digits) || /(?:^|\D)0\d{9,10}(?:\D|$)/.test(digits);
}

/**
 * null when the note is fine to publish, otherwise the sentence to show the
 * contractor. Phrased as what to do, not what they did wrong.
 */
export function clientNoteProblem(note: string): string | null {
  const t = note.trim();
  if (!t) return null;
  if (t.length > CLIENT_NOTE_MAX) {
    return `That note is a bit long — keep it under ${CLIENT_NOTE_MAX} characters.`;
  }
  if (LINK.test(t) || DOMAIN.test(t) || EMAIL.test(t)) {
    return 'Please take the link or email address out — the customer deals with us until they accept a price.';
  }
  if (hasPhoneNumber(t)) {
    return 'Please take the phone number out — we pass your details on once the customer accepts your price.';
  }
  if (MONEY.test(t)) {
    return 'Please leave amounts out of the note — the customer sees our price, not yours, so a figure here will confuse them. Put it in the price box instead.';
  }
  return null;
}
