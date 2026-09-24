import { HOME_SERVICES } from '@/lib/home/services';
import type { CanonicalService } from './schema';

/**
 * Services whose front-page pick classifies the job outright. A pick is the
 * customer telling us, not us guessing, so it can skip the "Is that right?"
 * step — but only where that buys something: these are the services with a
 * question flow of their own on the confirm step, which a job never reaches
 * unless it is classified. Everything else still arrives as words in the
 * description box, as it always has.
 */
const PICK_CLASSIFIES: ReadonlySet<CanonicalService> = new Set([
  'Fencing',
  'Weed control',
  // Topping's questions (last cut, what's growing, the ground) were written
  // first and almost never shown: the card never classified the job.
  'Paddock topping',
]);

/**
 * Cards whose name is not a canonical service but whose pick still means
 * one. "Weed control & spraying" covers two rows; the customer picking it is
 * asking for weeds to be dealt with, which is Weed control — and both rows ask
 * the same weed question, so nothing depends on which one it lands in.
 */
const CARD_SERVICE: Partial<Record<string, CanonicalService>> = {
  'weed-control': 'Weed control',
};

/**
 * The canonical service a home-page pick (`?service=<card slug>`) stands for,
 * or null. Resolved through the card's name, and only where that name IS a
 * canonical one: several cards merge two services ("Weed control" covers
 * Spraying too), and a merged card must not quietly choose one.
 */
export function serviceFromPick(slug: string | null | undefined): CanonicalService | null {
  if (!slug) return null;
  const card = HOME_SERVICES.find((c) => c.slug === slug);
  const name = CARD_SERVICE[slug] ?? (card?.name as CanonicalService | undefined);
  return name && PICK_CLASSIFIES.has(name) ? name : null;
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
