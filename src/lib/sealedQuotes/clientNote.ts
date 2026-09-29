/**
 * The contractor's note that goes to the customer, checked before it is stored.
 *
 * This is the only contractor-authored free text a customer ever sees, and
 * nothing reviews it: submit_contractor_quote publishes in the same
 * transaction that stores it. Four things must not get through.
 *
 * - **Their own price.** The customer is looking at contractor price +
 *   sq_markup_rate. "£400 all in" on a quote showing £440 hands them the
 *   margin.
 * - **A way to reach them.** Identity is masked as "Contractor A" until the
 *   job is awarded and paid for — a phone number or an email in the note
 *   walks straight round that, and round clause 8 of the contractor terms.
 * - **Links.** Same reason, and the email renderer linkifies anything
 *   URL-shaped, so a link that reached an email would be clickable.
 * - **Paying some other way.** Cash, a transfer, VAT off — see OFF_PLATFORM.
 *   These are also flagged to admin (offPlatformAlert.ts).
 *
 * We refuse rather than silently strip: a contractor who thinks the customer
 * read something they never saw is worse off than one who is told to reword
 * it. Judgement calls we deliberately let through — a bare "400", "2 acres",
 * "24 hours" — are why admin can clear a published note.
 */

export const CLIENT_NOTE_MAX = 200;

export const LINK = /\bhttps?:\/\/|\bwww\./i;
/** A bare domain, but only for endings that are not ordinary words. */
export const DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:co\.uk|com|net|org|uk|io|co)\b/i;
export const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/**
 * Any mention of money. Three shapes, because a price can be written without
 * a currency symbol and without a space:
 *
 *  - a symbol anywhere: £450, $450, €450
 *  - a currency word, with or without a numeral beside it: "quid",
 *    "pounds" — "four hundred pounds" is the figure too, so these are
 *    blocked outright rather than only next to a digit — and "gbp" either
 *    side of one, with no space needed ("GBP450", "450GBP")
 *  - a unit rate: "400 per acre", "40/acre", "£40 an hour"
 *
 * Bare digits stay legal: "2 acres", "24 hours", "3 metres", "12 October".
 * A bare total — "400 all in" — still gets through, and always will without
 * reading the sentence; that is what the admin Clear button is for.
 */
export const MONEY = new RegExp(
  [
    '[£$€]',
    '\\bquid\\b',
    '\\bpounds?\\b',
    '\\bgbp\\s*\\d|\\d\\s*gbp\\b',
    '\\d\\s*(?:\\/|\\bper\\b|\\ban?\\b)\\s*(?:acre|hour|hr|day|metre|meter|m|yard|bale|tonne|ton)\\b',
  ].join('|'),
  'i',
);

/**
 * An offer to be paid outside the platform: cash, a transfer or a cheque
 * straight to the contractor, or VAT "knocked off" for doing it that way.
 * Found live on 29 Sept ("If it is cash on the day I will take the VAT
 * off"). Every job is paid through us — deposit, then balance — so this
 * cuts out the margin and the customer's protection at once.
 *
 * Not refused on its own: "no VAT" and "without VAT" are how a contractor
 * who isn't registered says so, and the price box already asks. Only VAT
 * taken OFF, which only makes sense as a deal for paying some other way.
 */
export const OFF_PLATFORM = new RegExp(
  [
    '\\bcash\\b',
    '\\bcheques?\\b',
    '\\bbank\\s+transfer\\b',
    '\\bbacs\\b',
    '\\b(?:pay|paid|paying)\\s+(?:me\\s+|us\\s+)?direct(?:ly)?\\b',
    '\\bvat\\s+off\\b',
    '\\b(?:take|knock|drop)\\s+(?:the\\s+)?vat\\b',
    '\\boff\\s+the\\s+books\\b',
    '\\b(?:outside|not\\s+through|bypass)\\s+(?:the\\s+)?(?:site|website|platform|app)\\b',
  ].join('|'),
  'i',
);

export const OFF_PLATFORM_REFUSAL =
  'Please leave payment arrangements out — every job is paid through us, deposit and balance, and nothing is paid to the contractor directly.';

/**
 * UK-shaped phone numbers, after separators are removed so "07123 456 789"
 * and "07123456789" read alike. +44…, 0… of 10-11 digits, or a bare 11-digit
 * run. Deliberately not matching shorter digit runs: acreages and dates.
 */
export function hasPhoneNumber(note: string): boolean {
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
  // Before MONEY: "400 quid cash" should be told about the cash, which is
  // the part admin gets flagged about.
  if (OFF_PLATFORM.test(t)) return OFF_PLATFORM_REFUSAL;
  if (MONEY.test(t)) {
    return 'Please leave amounts out of the note — the customer sees our price, not yours, so a figure here will confuse them. Put it in the price box instead.';
  }
  return null;
}
