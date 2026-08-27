import { normalisePostcode } from '@/lib/postcodes';
import type { AreaUnit, DeterministicResult, Urgency } from './schema';

/**
 * Deterministic pre-extraction (spec §6.1). Pure functions, no I/O — this
 * layer always runs, costs nothing, and is the safety net when the LLM call
 * fails or times out (§6.4). Anything with a hard format is pulled here;
 * where the two layers disagree on postcodes or numbers, this layer wins —
 * language models transpose digits, regexes don't (§6.3).
 *
 * It is deliberately conservative: it extracts only what is unambiguous and
 * stays silent otherwise ("the paddock's got away from me" yields nothing
 * here — interpreting that is the LLM's job).
 */

// Full postcodes are unambiguous anywhere in free text. Outward-only codes
// are NOT extracted from free text — road names ("the A31") match the same
// shape — so outcodes are trusted only from the dedicated location input.
const FULL_POSTCODE_RE = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/gi;

export function extractPostcode(
  rawText: string,
  locationRaw: string,
): { full: string | null; outcode: string | null } {
  // The dedicated location field is authoritative when it parses as a bare
  // postcode or outcode…
  const fromLocation = normalisePostcode(locationRaw);
  if (fromLocation.full || fromLocation.outcode) return fromLocation;

  // …but customers also write "Romsey SO51 6FP" or "just outside Alresford,
  // SO24 9AA" — a full postcode embedded anywhere in the field still counts.
  const inLocation = locationRaw.match(FULL_POSTCODE_RE);
  if (inLocation?.length) return normalisePostcode(inLocation[0]);

  const inText = rawText.match(FULL_POSTCODE_RE);
  if (inText?.length) return normalisePostcode(inText[0]);

  return { full: null, outcode: null };
}

const UNIT_MAP: Record<string, AreaUnit | 'tonnes'> = {
  acre: 'acres',
  acres: 'acres',
  ac: 'acres',
  hectare: 'hectares',
  hectares: 'hectares',
  ha: 'hectares',
  'sq m': 'sq_m',
  sqm: 'sq_m',
  m2: 'sq_m',
  'square metres': 'sq_m',
  'square meters': 'sq_m',
  m: 'linear_m',
  metre: 'linear_m',
  metres: 'linear_m',
  meter: 'linear_m',
  meters: 'linear_m',
  tonne: 'tonnes',
  tonnes: 'tonnes',
  t: 'tonnes',
};

const QUANTITY_RE =
  /(\d+(?:\.\d+)?)\s*(square\s+met(?:re|er)s?|sq\.?\s*m\b|m2\b|acres?\b|ac\b|hectares?\b|ha\b|met(?:re|er)s?\b|m\b|tonnes?\b|t\b)/gi;

export function extractQuantities(text: string): DeterministicResult['quantities'] {
  const out: DeterministicResult['quantities'] = [];
  for (const match of text.matchAll(QUANTITY_RE)) {
    const key = match[2].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const unit = UNIT_MAP[key];
    if (!unit) continue;
    out.push({ value: Number(match[1]), unit, raw: match[0].trim() });
  }
  return out;
}

/** Acre conversions for the canonical store (§6.3). linear_m has no area equivalent. */
export function toAcres(value: number, unit: AreaUnit): number | null {
  switch (unit) {
    case 'acres':
      return value;
    case 'hectares':
      return value * 2.47105;
    case 'sq_m':
      return value / 4046.86;
    case 'linear_m':
      return null;
  }
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dates and relative dates. `now` is a parameter so tests are reproducible.
 * Returns urgency only when the wording is explicit; inference from tone is
 * the LLM's territory.
 */
export function extractDates(
  text: string,
  now: Date,
): { urgency: Urgency | null; target_date: string | null } {
  const lower = text.toLowerCase();

  // Explicit numeric date: dd/mm/yyyy or dd/mm/yy or dd-mm-yyyy.
  const numeric = lower.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    const d = new Date(Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1])));
    if (!Number.isNaN(d.getTime())) return { urgency: 'dated', target_date: iso(d) };
  }

  // "12 September" / "12th of September" / "September 12".
  const dayMonth = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
  );
  const monthDay = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  const pair = dayMonth
    ? { day: Number(dayMonth[1]), month: MONTHS.indexOf(dayMonth[2]) }
    : monthDay
      ? { day: Number(monthDay[2]), month: MONTHS.indexOf(monthDay[1]) }
      : null;
  if (pair && pair.day >= 1 && pair.day <= 31) {
    const year =
      pair.month < now.getUTCMonth() ||
      (pair.month === now.getUTCMonth() && pair.day < now.getUTCDate())
        ? now.getUTCFullYear() + 1
        : now.getUTCFullYear();
    return { urgency: 'dated', target_date: iso(new Date(Date.UTC(year, pair.month, pair.day))) };
  }

  // "before September" / "by September" → first of that month, next occurrence.
  const beforeMonth = lower.match(
    /\b(?:before|by)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
  );
  if (beforeMonth) {
    const month = MONTHS.indexOf(beforeMonth[1]);
    const year = month <= now.getUTCMonth() ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    return { urgency: 'dated', target_date: iso(new Date(Date.UTC(year, month, 1))) };
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { urgency: 'dated', target_date: iso(d) };
  }

  if (/\basap\b|\bas soon as possible\b|\burgent(?:ly)?\b/.test(lower)) {
    return { urgency: 'asap', target_date: null };
  }
  if (/\bwithin (?:a|the|this) month\b|\bthis month\b/.test(lower)) {
    return { urgency: 'within_month', target_date: null };
  }
  if (/\bno rush\b|\bwhenever\b|\bflexible\b|\bany ?time\b/.test(lower)) {
    return { urgency: 'flexible', target_date: null };
  }

  return { urgency: null, target_date: null };
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
// UK numbers: 0- or +44-prefixed, 10–11 digits, spaces/dashes tolerated.
const PHONE_RE = /(?:\+44\s?\d|0\d)(?:[\s-]?\d){8,9}\b/;

export function extractContact(text: string): { phone: string | null; email: string | null } {
  return {
    phone: text.match(PHONE_RE)?.[0].trim() ?? null,
    email: text.match(EMAIL_RE)?.[0] ?? null,
  };
}

export function deterministicParse(
  rawText: string,
  locationRaw: string,
  now: Date,
): DeterministicResult {
  const postcode = extractPostcode(rawText, locationRaw);
  const quantities = extractQuantities(rawText);
  const areaQty = quantities.find((q) => q.unit !== 'tonnes');
  const dates = extractDates(rawText, now);
  const contact = extractContact(rawText);

  return {
    postcode_full: postcode.full,
    postcode_outcode: postcode.outcode,
    quantities,
    area: areaQty ? { value: areaQty.value, unit: areaQty.unit as AreaUnit } : null,
    urgency: dates.urgency,
    target_date: dates.target_date,
    phone: contact.phone,
    email: contact.email,
  };
}
