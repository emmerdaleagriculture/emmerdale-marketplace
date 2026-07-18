import { getCounties } from '@/lib/reference';

/**
 * Config for the customer-facing marketplace verticals (hay, tractor hire).
 * Drives both the top-level pages and the per-county landing pages, so a new
 * vertical or new copy lives in one place.
 */
export type VerticalKey = 'hay-bales' | 'tractor-hire';

export type VerticalConfig = {
  slug: VerticalKey;
  category: 'hay' | 'tractor-hire';
  eyebrow: string;
  /** metadata (the layout appends " | Emmerdale Agriculture") */
  metaTitle: (county: string) => string;
  metaDescription: (county: string) => string;
  /** hero heading, split so the last phrase can be italicised */
  h1Main: (county: string) => string;
  h1Em: string;
  intro: (county: string) => string;
  /** Service structured data */
  serviceName: string;
  serviceType: string[];
  serviceDescription: (county: string) => string;
  /** enquiry form labels */
  detailsLabel: string;
  detailsPlaceholder: string;
  submitLabel: string;
  faqs: (county: string) => { q: string; a: string }[];
};

export const VERTICALS: Record<VerticalKey, VerticalConfig> = {
  'hay-bales': {
    slug: 'hay-bales',
    category: 'hay',
    eyebrow: 'Hay · Straw · Haylage',
    metaTitle: (c) => `Hay, Straw & Haylage Suppliers in ${c}`,
    metaDescription: (c) =>
      `Looking for hay, straw or haylage in ${c}? Tell us what you need and we’ll match you with a supplier near you — big bales or small, delivered or collected.`,
    h1Main: (c) => `Hay, straw & haylage in ${c} —`,
    h1Em: 'matched to a supplier near you.',
    intro: (c) =>
      `Whether it’s a few small bales for the ponies or a full load of big bales for the yard, tell us what you need and we’ll match you with a hay, straw or haylage supplier in ${c}. Delivered or collected, no obligation.`,
    serviceName: 'Hay, straw & haylage supply',
    serviceType: ['Hay supply', 'Straw supply', 'Haylage supply'],
    serviceDescription: (c) =>
      `Sourcing hay, straw and haylage for horse owners, smallholders, farms and equestrian yards in ${c} — matched to local suppliers.`,
    detailsLabel: 'What do you need?',
    detailsPlaceholder: 'e.g. 20 large square bales of meadow hay, delivered — needed within 2 weeks',
    submitLabel: 'Send hay enquiry',
    faqs: (c) => [
      {
        q: `Can you supply hay in ${c}?`,
        a: `Yes — we match hay, straw and haylage enquiries with suppliers across ${c}. Tell us the forage type, quantity and how you’d like it delivered or collected, and we’ll connect you with someone local who has it.`,
      },
      {
        q: 'What types can I get?',
        a: 'Meadow and seed hay, barley and wheat straw, and haylage — in big square or round bales, or conventional small bales, by the load or the trailer-full.',
      },
      {
        q: 'How much does it cost?',
        a: 'Price depends on the forage type, bale size, quantity and distance, and it’s agreed directly with the supplier. Send an enquiry and we’ll come back with options — no obligation.',
      },
    ],
  },
  'tractor-hire': {
    slug: 'tractor-hire',
    category: 'tractor-hire',
    eyebrow: 'Tractor hire · Events',
    metaTitle: (c) => `Tractor Hire in ${c} — Weddings, Proms & Events`,
    metaDescription: (c) =>
      `Hire a tractor and trailer in ${c} for a wedding, prom, photoshoot or parade — matched with an experienced operator near you. Driver included, no obligation.`,
    h1Main: (c) => `Tractor hire in ${c} —`,
    h1Em: 'for weddings, proms & events.',
    intro: (c) =>
      `Arriving at your wedding on a tractor and trailer, a vintage tractor for the prom, or a proper farm tractor for a photoshoot — tell us the occasion and we’ll match you with an experienced operator in ${c}. Driver included, no obligation.`,
    serviceName: 'Tractor & trailer hire for events',
    serviceType: ['Wedding tractor hire', 'Prom tractor hire', 'Event tractor hire'],
    serviceDescription: (c) =>
      `Tractor and trailer hire with an experienced operator for weddings, proms, photoshoots and events in ${c}.`,
    detailsLabel: 'What’s the occasion?',
    detailsPlaceholder: 'e.g. Vintage tractor + trailer to bring the bride to a wedding on 14 June — about 2 miles',
    submitLabel: 'Send tractor enquiry',
    faqs: (c) => [
      {
        q: `Can I hire a tractor in ${c}?`,
        a: `Yes — we match tractor-hire enquiries with operators across ${c}. Tell us the date, the place and the occasion, and we’ll connect you with someone local who can help.`,
      },
      {
        q: 'What can I hire one for?',
        a: 'Weddings, proms, photoshoots, parades, farm-themed parties and promotional events. An experienced operator drives it — you’re not expected to drive it yourself.',
      },
      {
        q: 'How much does it cost?',
        a: 'It depends on the tractor, distance and duration, and it’s agreed directly with the operator. Send an enquiry with the date and location and we’ll come back with options.',
      },
    ],
  },
};

/** URL-safe slug for a county name. "East Riding of Yorkshire" → "east-riding-of-yorkshire". */
export function countySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type CountyRef = { name: string; slug: string; region: string };

/** All counties as slug refs (for generateStaticParams and sitemaps). */
export async function allCountyRefs(): Promise<CountyRef[]> {
  const counties = await getCounties();
  return counties.map((c) => ({ name: c.name, slug: countySlug(c.name), region: c.region }));
}

/** Resolve a county slug to its name/region plus its same-region siblings. */
export async function resolveCountyBySlug(
  slug: string,
): Promise<{ county: CountyRef; siblings: CountyRef[] } | null> {
  const refs = await allCountyRefs();
  const county = refs.find((c) => c.slug === slug);
  if (!county) return null;
  const siblings = refs.filter((c) => c.region === county.region && c.slug !== county.slug);
  return { county, siblings };
}
