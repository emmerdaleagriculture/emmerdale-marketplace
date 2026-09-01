/**
 * The curated note-tag taxonomy (ported from the HPM blog). One source of
 * truth for:
 *  - the /notes filter chips (display order = this order)
 *  - the /notes/tag/[tag] hub pages (label + meta copy)
 *  - the sitemap's hub entries
 *  - the admin editor's tag picker
 */
export type TagDef = {
  slug: string;
  label: string;
  /** <title> for the hub page (the layout template appends the brand). */
  metaTitle: string;
  /** Meta description + hub-page subheading. */
  description: string;
};

export const CURATED_TAGS: TagDef[] = [
  {
    slug: 'topping',
    label: 'Topping',
    metaTitle: 'Paddock topping notes',
    description:
      'Notes on topping and mowing paddocks — when to cut, what kit does the job, and how to keep grass in shape.',
  },
  {
    slug: 'weeds',
    label: 'Weeds',
    metaTitle: 'Weed control notes',
    description:
      'Dealing with ragwort, docks, thistles and buttercups in paddocks — spraying, timing, and what actually works.',
  },
  {
    slug: 'drainage',
    label: 'Drainage',
    metaTitle: 'Paddock drainage notes',
    description:
      'Fixing waterlogged paddocks and fields — mole ploughing, drainage problems, and keeping ground usable through winter.',
  },
  {
    slug: 'ground-care',
    label: 'Ground care',
    metaTitle: 'Paddock ground care notes',
    description:
      'Harrowing, rolling, overseeding, fertiliser and soil health — practical notes on keeping paddock ground in good order.',
  },
  {
    slug: 'equipment',
    label: 'Equipment',
    metaTitle: 'Paddock machinery & equipment notes',
    description:
      'The machinery behind the work — compact tractors, flail mowers, collectors and attachments, reviewed from real jobs.',
  },
  {
    slug: 'hedges',
    label: 'Hedges',
    metaTitle: 'Hedge cutting & care notes',
    description:
      'Hedge cutting, trimming and hedge health — when to cut, what the law allows, and spotting problems early.',
  },
  {
    slug: 'clearance',
    label: 'Clearance',
    metaTitle: 'Land clearance & wood chipping notes',
    description:
      'Clearing overgrown paddocks and neglected grazing — scrub, brambles and self-seeded trees, what the machinery can take, and turning land back into usable pasture.',
  },
  {
    slug: 'hay',
    label: 'Hay',
    metaTitle: 'Hay, straw & haylage notes',
    description:
      'Making, buying and storing hay, straw and haylage — bale types, cut timing, and what good forage looks like.',
  },
  {
    slug: 'tractor-hire',
    label: 'Tractor hire',
    metaTitle: 'Tractor & operator hire notes',
    description:
      'Hiring a tractor and operator — what jobs suit hired kit, what it costs, and how to get the most from a day’s hire.',
  },
  {
    slug: 'seasonal',
    label: 'Seasonal',
    metaTitle: 'Seasonal paddock care notes',
    description:
      'What paddocks need through the year — winter grass heights, autumn overseeding, and season-by-season jobs.',
  },
  {
    slug: 'advice',
    label: 'Advice',
    metaTitle: 'Paddock care advice',
    description:
      'General paddock care advice — spotting problems early, choosing the right treatment, and knowing when to call someone in.',
  },
];

export function tagDef(slug: string | null | undefined): TagDef | null {
  if (!slug) return null;
  return CURATED_TAGS.find((t) => t.slug === slug) ?? null;
}

/**
 * Per-tag call-to-action for the article pages. Each vertical has its own
 * indexable landing page, and the default routes to /paddock-maintenance —
 * not /start, which is noindex + robots-disallowed (the paid-ads entry
 * point), so linking to it from an article strands the reader's click.
 * /paddock-maintenance carries the same step-1 form.
 */
export type NoteCta = {
  href: string;
  label: string;
  /** Title, split so the page can italicise the emphasis span. */
  title: string;
  titleEm: string;
  sub: string;
};

export function ctaForTag(slug: string | null | undefined): NoteCta {
  if (slug === 'hay') {
    return {
      href: '/hay-bales',
      label: 'See hay for sale →',
      title: 'Hay, straw and haylage from',
      titleEm: 'local producers',
      sub: 'Tell us what you need and producers who cover your area get in touch.',
    };
  }
  if (slug === 'tractor-hire') {
    return {
      href: '/tractor-hire',
      label: 'See tractor hire →',
      title: 'Tractor and operator hire',
      titleEm: 'near you',
      sub: 'Describe the job and local operators who cover your area get in touch.',
    };
  }
  return {
    href: '/paddock-maintenance',
    label: 'Post your job →',
    title: 'Contractors who cover',
    titleEm: 'your area',
    sub: 'Describe the job in your own words — we sort the details and pass it to contractors who can actually do it.',
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Notes ↔ service pages
   The two link directions share one map, so a new tag or a new vertical only
   has to be described once:
     - serviceLinksForTags()  note  → the service pages it belongs to
     - SERVICE_NOTE_TAGS      page  → the note tags worth surfacing on it
   ──────────────────────────────────────────────────────────────────────── */

export type ServiceLink = {
  href: string;
  label: string;
  /** One line of context, so the link block reads as editorial, not a nav. */
  blurb: string;
};

const PADDOCK_LINK: ServiceLink = {
  href: '/paddock-maintenance',
  label: 'Paddock maintenance & field work',
  blurb:
    'Topping, harrowing, rolling, spraying, hedge cutting and clearance — describe the field and we pass it to contractors covering your area.',
};

const HAY_LINK: ServiceLink = {
  href: '/hay-bales',
  label: 'Hay, straw & haylage',
  blurb:
    'Big bales or small, delivered or collected — matched to a producer near you.',
};

const TRACTOR_LINK: ServiceLink = {
  href: '/tractor-hire',
  label: 'Tractor & operator hire',
  blurb:
    'A tractor and an experienced operator for the day, or for a wedding, prom or photoshoot.',
};

const JOIN_LINK: ServiceLink = {
  href: '/signup',
  label: 'Join the contractor network',
  blurb:
    'Free to join. Pick the counties you cover and get the jobs posted in them.',
};

/**
 * Which service pages a note about each tag should point readers at. Order
 * matters — the first entry is the closest match.
 */
const TAG_SERVICE_LINKS: Record<string, ServiceLink[]> = {
  topping: [PADDOCK_LINK],
  weeds: [PADDOCK_LINK],
  drainage: [PADDOCK_LINK],
  'ground-care': [PADDOCK_LINK],
  hedges: [PADDOCK_LINK],
  clearance: [PADDOCK_LINK],
  seasonal: [PADDOCK_LINK],
  advice: [PADDOCK_LINK],
  equipment: [TRACTOR_LINK, PADDOCK_LINK],
  hay: [HAY_LINK, PADDOCK_LINK],
  'tractor-hire': [TRACTOR_LINK, PADDOCK_LINK],
};

/**
 * The service pages to link from a note, deduped and closest-match first.
 * Untagged posts still get the paddock front door rather than nothing —
 * an article with no onward link to an indexable service page is a dead end
 * for both readers and internal link equity.
 */
export function serviceLinksForTags(tags: string[], includeJoin = false): ServiceLink[] {
  const out: ServiceLink[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    for (const link of TAG_SERVICE_LINKS[t] ?? []) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      out.push(link);
    }
  }
  if (out.length === 0) {
    out.push(PADDOCK_LINK);
    seen.add(PADDOCK_LINK.href);
  }
  if (includeJoin && !seen.has(JOIN_LINK.href)) out.push(JOIN_LINK);
  return out;
}

/**
 * The reverse direction: note tags worth surfacing on each service page, so
 * /paddock-maintenance, /hay-bales and /tractor-hire link *into* the notes
 * rather than only being linked from them. Keyed by the page's path segment
 * (matches CountyPageBase in @/lib/verticals).
 */
export const SERVICE_NOTE_TAGS: Record<string, string[]> = {
  'paddock-maintenance': [
    'topping',
    'weeds',
    'drainage',
    'ground-care',
    'hedges',
    'clearance',
    'seasonal',
    'advice',
    'equipment',
  ],
  'hay-bales': ['hay'],
  'tractor-hire': ['tractor-hire', 'equipment'],
};
