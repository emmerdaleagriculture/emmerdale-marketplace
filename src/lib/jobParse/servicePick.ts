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
const PICK_CLASSIFIES: ReadonlySet<CanonicalService> = new Set(['Fencing']);

/**
 * The canonical service a home-page pick (`?service=<card slug>`) stands for,
 * or null. Resolved through the card's name, and only where that name IS a
 * canonical one: several cards merge two services ("Weed control" covers
 * Spraying too), and a merged card must not quietly choose one.
 */
export function serviceFromPick(slug: string | null | undefined): CanonicalService | null {
  if (!slug) return null;
  const card = HOME_SERVICES.find((c) => c.slug === slug);
  const name = card?.name as CanonicalService | undefined;
  return name && PICK_CLASSIFIES.has(name) ? name : null;
}

/**
 * Services the description itself names clearly enough to offer as a choice.
 * Offered, never assumed: "top the paddock, the fence is down one side"
 * mentions a fence and is not a fencing job, so this fills the alternatives
 * the customer picks from rather than the service they are asked to confirm.
 */
const MENTIONS: [CanonicalService, RegExp][] = [['Fencing', /\bfenc(?:e|es|ing)\b/i]];

export function servicesMentioned(text: string): CanonicalService[] {
  return MENTIONS.filter(([, re]) => re.test(text)).map(([name]) => name);
}
