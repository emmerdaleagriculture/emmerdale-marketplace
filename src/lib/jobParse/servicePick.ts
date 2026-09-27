import { HOME_SERVICES } from '@/lib/home/services';
import { CANONICAL_SERVICES, type CanonicalService } from './services';

/**
 * Cards whose name is not a canonical service but whose pick still means
 * one. "Weed control & spraying" covers two rows; the customer picking it is
 * asking for weeds to be dealt with, which is Weed control — and both rows ask
 * the same weed question, so nothing depends on which one it lands in.
 */
const CARD_SERVICE: Partial<Record<string, CanonicalService>> = {
  'weed-control': 'Weed control',
  'muck-sweeping': 'Manure sweeping',
};

/**
 * Cards that genuinely cover two jobs, where a pick must not quietly choose
 * one. They are offered back as a choice instead.
 */
const CARD_CHOICES: Partial<Record<string, CanonicalService[]>> = {
  'land-clearance': ['Land clearance', 'Ditch clearance'],
};

const CANONICAL: ReadonlySet<string> = new Set(CANONICAL_SERVICES);

/**
 * The canonical service a home-page pick (`?service=<card slug>`) stands for,
 * or null. A pick is the customer telling us, not us guessing, so it
 * classifies the job outright.
 *
 * It used to classify only the services with a question flow, and every
 * other pick arrived as words with no service at all: on 26 Sep a Hedge
 * cutting pick went to contractors as unmatched, and 23 of 32 jobs since 14
 * Sep carried no service. A merged card (CARD_CHOICES) still returns null.
 */
export function serviceFromPick(slug: string | null | undefined): CanonicalService | null {
  if (!slug) return null;
  const card = HOME_SERVICES.find((c) => c.slug === slug);
  if (!card) return null;
  const name = CARD_SERVICE[slug] ?? card.name;
  return CANONICAL.has(name) ? (name as CanonicalService) : null;
}

/** The services a merged card's pick is offered as, or none. */
export function choicesFromPick(slug: string | null | undefined): CanonicalService[] {
  return (slug && CARD_CHOICES[slug]) || [];
}

/**
 * Services the description itself names clearly enough to offer as a choice.
 * Offered, never assumed: "top the paddock, the fence is down one side"
 * mentions a fence and is not a fencing job, so this fills the alternatives
 * the customer picks from rather than the service they are asked to confirm.
 */
// Topping is here for the jobs that mention weeds without being weed jobs:
// "orchard topping to control bracken and thistle" must not be offered
// Weed control alone. Same stems jobs_in_progress uses (topping/topped/top the).
const MENTIONS: [CanonicalService, RegExp][] = [
  ['Fencing', /\bfenc(?:e|es|ing)\b/i],
  ['Paddock topping', /\b(?:topp(?:ing|ed)|top the)\b/i],
  ['Weed control', /\b(?:weeds?|ragwort|thistles?|docks|nettles|bracken|buttercups?|horsetail)\b/i],
  ['Spraying', /\bspray(?:s|ed|ing)?\b/i],
];

/** In the order the customer mentioned them: the first thing they asked for leads. */
export function servicesMentioned(text: string): CanonicalService[] {
  return MENTIONS.flatMap(([name, re]) => {
    const at = text.search(re);
    return at < 0 ? [] : [{ name, at }];
  })
    .sort((a, b) => a.at - b.at)
    .map((m) => m.name);
}
