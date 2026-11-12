/**
 * Relevance rules for the tender watch (Open members' council contracts).
 *
 * Ported from HPM's watcher (hpm-site dde829a), which was tuned against
 * 2023–26 Contracts Finder history for Hampshire. Here the watch is national:
 * every notice that scores is kept with its place, and each Open member sees
 * the ones on their own patch (sq_tenders_for). Contracts Finder's keyword
 * search is a loose OR match — "land management" returns metering
 * frameworks — so everything it returns is re-scored here and most of it is
 * thrown away.
 */

/** Approach the buyer this many months before a running contract ends. */
export const RENEWAL_LEAD_MONTHS = 4;

/**
 * Keyword searches sent to Contracts Finder (each is a separate query, sent
 * as a quoted phrase — unquoted, CF ORs the words: "grounds maintenance"
 * matches 26k notices over 5 years vs 1.2k as a phrase).
 */
export const SEARCH_KEYWORDS = [
  'grass cutting',
  'verge cutting',
  'hedge cutting',
  'grounds maintenance',
  'ground maintenance',
  'land maintenance',
  'verge',
  'hedge',
  'mowing',
  'flail',
  'weed control',
  'ditch',
  'vegetation clearance',
  'scrub clearance',
  'meadow',
  'grazing',
  'rights of way',
  'land drainage',
  'japanese knotweed',
  'tree works',
  'countryside',
  'paddock',
];

/** CPV code prefixes that indicate land work. */
const CPV_PREFIXES: Array<[string, string]> = [
  ['7731', 'planting & maintenance of green areas'], // 77310000 + children (grass cutting, weed clearance, grounds maint.)
  ['7732', 'sports fields maintenance'],
  ['7734', 'tree pruning & hedge trimming'],
  ['77211', 'forestry: clearing / tree cutting'],
  ['771', 'agricultural services'],
  ['77112', 'hire of mowers with operator'],
  ['45232452', 'drainage works'],
  ['90722', 'environmental rehabilitation'],
];

const RURAL_TERMS = [
  'verge', 'hedge', 'ditch', 'vegetation', 'scrub', 'meadow', 'rights of way', 'prow',
  'flail', 'knotweed', 'ragwort', 'grazing', 'countryside', 'land drainage', 'watercourse',
  'drainage', 'tree', 'woodland', 'paddock', 'topping', 'mole plough', 'chipping', 'invasive',
];
const GROUNDS_TERMS = [
  'grounds maintenance', 'ground maintenance', 'grass cutting', 'grass-cutting', 'mowing',
  'cemetery', 'burial ground', 'churchyard', 'playing field', 'sports pitch', 'pitch maintenance',
  'open space', 'weed control', 'herbicide', 'streetscene',
];

/** Titles containing these are almost never land work, whatever the keywords say. */
const NEGATIVE_TITLE =
  /playground|play area|play equipment|skate|roof|refurb|sewerage|solar|software|catering|cleaning services|air condition|boiler|lift |cctv|vehicle|tractor purchase|ride on mower|mower purchase|servicing|design and build|riba|consultan|survey|advertising|metering|library|school meals|traffic management|investigation|jet wash|hub operator|passenger|taxi|\bseats\b|home to school/i;

/** Whole-word, case-insensitive matcher ("tree" must not match "streetscene"). */
const wordRe = (term: string) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const RURAL_RES = RURAL_TERMS.map((t) => [t, wordRe(t)] as const);
const GROUNDS_RES = GROUNDS_TERMS.map((t) => [t, wordRe(t)] as const);

export type Fit = 'rural' | 'grounds' | 'unsure';

export interface Relevance {
  score: number;
  fit: Fit;
  matched: string[];
}

export function scoreRelevance(title: string, description: string, cpvCodes: string[]): Relevance {
  const t = title;
  const d = description.slice(0, 2000);
  const matched = new Set<string>();
  let score = 0;
  let rural = 0;
  let grounds = 0;

  for (const [term, re] of RURAL_RES) {
    if (re.test(t)) { score += 3; rural += 3; matched.add(term); }
    else if (re.test(d)) { score += 1; rural += 1; matched.add(term); }
  }
  for (const [term, re] of GROUNDS_RES) {
    if (re.test(t)) { score += 3; grounds += 3; matched.add(term); }
    else if (re.test(d)) { score += 1; grounds += 1; matched.add(term); }
  }
  for (const code of cpvCodes) {
    const hit = CPV_PREFIXES.find(([p]) => code.startsWith(p));
    if (hit) { score += 3; matched.add(`CPV ${code} (${hit[1]})`); }
  }
  if (NEGATIVE_TITLE.test(title)) score -= 10;

  const fit: Fit = rural === 0 && grounds === 0 ? 'unsure' : rural >= grounds ? 'rural' : 'grounds';
  return { score, fit, matched: [...matched] };
}

/** Minimum score to keep a notice. A single title hit (3) is enough. */
export const MIN_SCORE = 3;

export function addMonths(date: Date, months: number): Date {
  // Clamped to the month's last day: 31 Mar − 4 months is 30 Nov, where a
  // bare setUTCMonth overflows to 1 Dec.
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedup key from buyer + title. Contracts Finder publishes a contract's
 * tender, closed and award notices under different ids ("… - AWARD"),
 * so the notice id alone would create 2–3 rows per contract.
 */
export function contractKey(buyer: string, title: string): string {
  const norm = (s: string) =>
    decodeEntities(s)
      .toLowerCase()
      .replace(/\b(award|awarded|invitation to (tender|quote) for|request for quote for)\b/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${norm(buyer)}|${norm(title)}`.slice(0, 250);
}
