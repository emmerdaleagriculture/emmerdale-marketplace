import type { Faq } from '@/components/paddock/PaddockSections';

/**
 * Hand-written additions to individual county pages, where Search Console
 * shows a county page ranking for a job or a place the template never
 * mentions (the monthly SEO agent, /admin/seo/opportunities, raises these).
 *
 * Keyed by county slug. Section paragraphs and FAQ answers may use
 * `[anchor](/path)` and `**bold**` (InlineMd). No hard-coded contractor
 * counts: anything numeric comes from live coverage.
 */
export type CountyExtra = {
  /** <title> override; gets the live coverage count. */
  metaTitle?: (coverage: number) => string;
  metaDescription?: string;
  section?: { kicker: string; h2: string; body: string[] };
  faqs?: Faq[];
};

const HEDGE_SEASON =
  'Hedge season opens as summer finishes, once nesting birds are done, and the cutting carries on through the autumn and winter. With the north-east’s tighter window for field work, it is worth getting a hedge job in before the ground softens and gateways get too wet for a tractor.';

const HEDGE_BRIEF =
  'Tell us roughly how long the hedges are, whether they need the top and one side or both sides, how overgrown they have got, and what the access is like: a field to work from, or a road verge. A photo helps. If you want a sense of cost first, there are [real prices from seven hedge cutting jobs](/notes/hedge-cutting-cost). Then [describe your hedges and get prices](/start): the job goes to contractors covering your area, and the ones with a hedge cutter get in touch with you directly.';

const HEDGE_WHEN_FAQ: Faq = {
  q: 'When is hedge cutting done?',
  a: 'Mostly from late summer through the winter, once birds have finished nesting. In the north-east it pays to book early in the season, before wet ground makes field access difficult. If you’re unsure about timing for your hedges, the contractor will advise.',
};

export const PADDOCK_COUNTY_EXTRAS: Record<string, CountyExtra> = {
  // GSC 2026-10/11: "paddock maintenance berkshire" at position 3, 25
  // impressions, no clicks. The template title leads with "Agricultural
  // Contractors", which is the wrong lead for this query.
  berkshire: {
    metaTitle: (n) =>
      n > 0 ? `Paddock Maintenance in Berkshire: ${n} Contractors` : 'Paddock Maintenance in Berkshire',
    metaDescription:
      'Topping, harrowing, rolling or a field gone to docks and nettles. Describe it in your own words and Berkshire contractors send you prices, free.',
  },

  // GSC: "local farm ditch cleaning warboys cambridgeshire" lands here, and
  // the page never mentioned ditches.
  cambridgeshire: {
    section: {
      kicker: 'Ditches',
      h2: 'Ditch cleaning in Cambridgeshire, from Warboys to the fen edge.',
      body: [
        'Across north Cambridgeshire, including the fen-edge ground around Warboys, field ditches do much of the drainage work. When they silt up or grow over, water sits on the land for longer, and black fen peat that is already prone to sitting wet gets worse. [Ditch clearance](/services/land-and-ditch-clearance) usually means two jobs: [flailing the banks](/services/flailing) to cut back the growth, then digging the silt and debris out of the bottom with an excavator, which leaves the ditch running again.',
        'It’s usually done once the ground is firm enough to carry the machine, because fen ground travels poorly when wet and a heavy excavator on a soft bank does more harm than good. If you’re not sure whether a ditch is yours to clear or forms part of a larger drain that someone else looks after, check before any work starts. Tell us where the ditch is, roughly how long it is, what’s growing in it and how a machine gets to it; a photo of the ditch and the gateway helps. Send it to [contractors covering Cambridgeshire](/start) and whoever covers your patch prices it directly. If it’s simply digger work you need, there’s [excavator hire with a driver](/services/excavator-hire-with-driver) too.',
      ],
    },
    faqs: [
      {
        q: 'Can I get a farm ditch cleaned out near Warboys?',
        a: 'Yes. Ditch cleaning is part of the land work we pass to contractors covering Cambridgeshire, and Warboys sits well within that. Give us the postcode, describe the ditch (length, how silted or overgrown it is, and access for a machine) and the contractors who cover your area will price it directly. Quotes are free and there’s no obligation to accept one.',
      },
    ],
  },

  // GSC: a dozen "agricultural hedge cutting <town> aberdeenshire" variants
  // land on the Aberdeen City page, which never mentioned hedges. Both pages
  // get the section; the Aberdeenshire one is the natural owner.
  'aberdeen-city': {
    section: {
      kicker: 'Hedges',
      h2: 'Hedge cutting in Aberdeen City and the north-east.',
      body: [
        `Field hedges, roadside boundaries and shelter belts round grazing are cut with a tractor-mounted flail: [agricultural hedge cutting](/services/hedge-cutting) is the same job whether the hedge runs along a pony paddock on the city edge or a farm boundary further out. ${HEDGE_SEASON}`,
        `${HEDGE_BRIEF} If your hedges are out in the county, towards Inverurie, Oldmeldrum or Balmedie, the [Aberdeenshire page](/paddock-maintenance/aberdeenshire) covers you; either way we match on the postcode.`,
      ],
    },
    faqs: [
      {
        q: 'Can I get farm or paddock hedges cut in Aberdeen City?',
        a: 'Yes. Describe the hedges: roughly how long they are, which sides need cutting, how overgrown they are and how a tractor gets to them. Contractors covering Aberdeen City with a tractor-mounted hedge cutter get in touch with you directly. It’s free, and there’s no obligation to accept a quote.',
      },
      HEDGE_WHEN_FAQ,
    ],
  },
  aberdeenshire: {
    section: {
      kicker: 'Hedges',
      h2: 'Agricultural hedge cutting across Aberdeenshire.',
      body: [
        `Field hedges, roadside boundaries and shelter belts are cut with a tractor-mounted flail, from paddocks around Inverurie, Oldmeldrum and Balmedie to farm boundaries up the Don and Deveron. [Agricultural hedge cutting](/services/hedge-cutting) is the same job on a pony paddock or a whole farm. ${HEDGE_SEASON}`,
        HEDGE_BRIEF,
      ],
    },
    faqs: [
      {
        q: 'Can I get farm hedges cut in Aberdeenshire?',
        a: 'Yes. Describe the hedges: roughly how long they are, which sides need cutting, how overgrown they are and how a tractor gets to them. Give us the postcode and contractors covering that part of Aberdeenshire with a tractor-mounted hedge cutter get in touch with you directly. It’s free, and there’s no obligation to accept a quote.',
      },
      HEDGE_WHEN_FAQ,
    ],
  },
};

export const TRACTOR_HIRE_COUNTY_EXTRAS: Record<string, CountyExtra> = {
  // GSC: "rent a tractor for farming near warboys" (position 7) and "tractor
  // driver hire cambridgeshire" land on a page that was all weddings.
  cambridgeshire: {
    metaTitle: () => 'Tractor Hire in Cambridgeshire: Farm Work & Events',
    metaDescription:
      'Tractor and driver hire in Cambridgeshire for farm and land work, or a tractor and trailer for a wedding or event. Matched to a contractor near you.',
    section: {
      kicker: 'Farm work',
      h2: 'Hiring a tractor and driver for farm and land work in Cambridgeshire.',
      body: [
        'Not every tractor enquiry here is for a wedding. If you need a tractor for work on the ground, whether that’s in Warboys, around Ramsey and Huntingdon, or further out across the Fens, the same network can help. The contractors covering Cambridgeshire are working farm and contracting businesses, and their tractors come with the implements they use every season: [toppers, flails](/services/flailing), harrows, rollers, rotavators and [trailers](/services/tractor-and-trailer-haulage). You describe the job, and the contractor brings the tractor, the kit and the person to drive it.',
        'That is usually the practical way to rent a tractor for farming: [tractor and driver hire](/services/tractor-and-driver-hire). You don’t have to source an implement, insure a machine or learn its controls on your own ground; you pay for the job done. [Tell us what needs doing](/start), roughly how much ground is involved, where it is and when you need it finished. Your enquiry goes to the contractors who cover your postcode, and whoever can fit it in comes back with a price. Work booked this way is covered by Emmerdale Agriculture’s own public liability policy.',
      ],
    },
    faqs: [
      {
        q: 'Can I rent a tractor to drive myself?',
        a: 'Jobs through the network are booked as a tractor with its contractor operating it, not as self-drive rental. For most farm and land work that’s simpler anyway: the contractor brings the right implement and does the job, and you pay for the work rather than the machine.',
      },
    ],
  },
};
