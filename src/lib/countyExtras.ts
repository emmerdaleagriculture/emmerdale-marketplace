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
  /** Rendered in order, after the template's own sections. */
  sections?: { kicker: string; h2: string; body: string[] }[];
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

  // GSC 2026-11 (Cheatcode): "paddock maintenance oxfordshire" at 8.3; the
  // page never said what paddock maintenance involves or linked a job page.
  oxfordshire: {
    sections: [
      {
        kicker: 'The work',
        h2: 'What paddock maintenance in Oxfordshire usually involves.',
        body: [
          'Most paddock maintenance comes down to a handful of jobs repeated through the year. [Topping](/services/paddock-topping) keeps the grass even and cuts off seed heads on docks and thistles before they spread. [Harrowing](/services/paddock-harrowing) pulls out dead thatch, spreads droppings and opens up the sward. Rolling on dry ground flattens the poaching left by winter hooves. Where weeds have taken over, [paddock spraying](/services/weed-control-and-spraying) deals with docks, nettles, thistles and buttercups. You can ask for one job or several together.',
          'On Oxfordshire ground, the order and timing matter. The thin brash on the Cotswold side dries quickly, so it can usually take a harrow and roller earlier in the year. Paddocks on the clay vales are best left until they will carry a tractor without rutting, and a clay field that stays wet may need drainage work before routine maintenance makes much difference. You don’t need to plan any of this yourself. [Describe the field and what you want from it](/start), and contractors covering Oxfordshire will price the work.',
        ],
      },
    ],
  },

  // GSC: "local farm ditch cleaning warboys cambridgeshire" lands here, and
  // the page never mentioned ditches.
  cambridgeshire: {
    sections: [
      {
        kicker: 'Ditches',
        h2: 'Ditch cleaning in Cambridgeshire, from Warboys to the fen edge.',
        body: [
          'Across north Cambridgeshire, including the fen-edge ground around Warboys, field ditches do much of the drainage work. When they silt up or grow over, water sits on the land for longer, and black fen peat that is already prone to sitting wet gets worse. [Ditch clearance](/services/land-and-ditch-clearance) usually means two jobs: [flailing the banks](/services/flailing) to cut back the growth, then digging the silt and debris out of the bottom with an excavator, which leaves the ditch running again.',
          'It’s usually done once the ground is firm enough to carry the machine, because fen ground travels poorly when wet and a heavy excavator on a soft bank does more harm than good. If you’re not sure whether a ditch is yours to clear or forms part of a larger drain that someone else looks after, check before any work starts. Tell us where the ditch is, roughly how long it is, what’s growing in it and how a machine gets to it; a photo of the ditch and the gateway helps. Send it to [contractors covering Cambridgeshire](/start) and whoever covers your patch prices it directly. If it’s simply digger work you need, there’s [excavator hire with a driver](/services/excavator-hire-with-driver) too.',
        ],
      },
    ],
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
    // GSC 2026-11 (Cheatcode): "agricultural hedge cutting perth aberdeenshire"
    // at position 4, 23 impressions, no clicks; Ballater, Westhill and Elgin
    // searches land here too.
    metaTitle: () => 'Agricultural Hedge Cutting & Paddock Work in Aberdeen',
    metaDescription:
      'Field hedges, roadside boundaries and shelter belts cut with a tractor-mounted flail. Tell us the length and access; local contractors send prices.',
    sections: [
      {
        kicker: 'Hedges',
        h2: 'Hedge cutting in Aberdeen City and the north-east.',
        body: [
          `Field hedges, roadside boundaries and shelter belts round grazing are cut with a tractor-mounted flail: [agricultural hedge cutting](/services/hedge-cutting) is the same job whether the hedge runs along a pony paddock on the city edge or a farm boundary further out. ${HEDGE_SEASON}`,
          `${HEDGE_BRIEF} If your hedges are out in the county, towards Inverurie, Oldmeldrum or Balmedie, the [Aberdeenshire page](/paddock-maintenance/aberdeenshire) covers you; either way we match on the postcode.`,
        ],
      },
      {
        kicker: 'Beyond the city',
        h2: 'Westhill, Deeside and further afield: which page covers your ground.',
        body: [
          'A lot of the land work people search for under “Aberdeen” is outside the city boundary. Westhill sits just west of the city in Aberdeenshire. Banchory, Aboyne and Ballater run up Deeside into hill country, and Elgin is across in Moray. None of that changes how the job works. Describe it, give us the postcode of the field, and it goes to the agricultural contractors in the network who cover that ground.',
          'The work changes as you head up the valley. Around Westhill and the city edge it is mostly small paddocks and grazing parcels: topping, harrowing and hedges round pony fields. Up Deeside towards Ballater there is more farm and estate ground, with rough grazing to flail back, longer boundary hedges, and stock fencing on hill land. On upland ground the season closes in sooner, so book early. If you are not sure what the field needs, [flailing](/services/flailing), [fencing](/services/fencing-contractors) or a [tractor and driver](/services/tractor-and-driver-hire) for the day, describe it in your own words and the contractor will tell you. For ground in the county, the [Aberdeenshire page](/paddock-maintenance/aberdeenshire) has the detail; for Elgin and Speyside, see [Moray](/paddock-maintenance/moray).',
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I get farm or paddock hedges cut in Aberdeen City?',
        a: 'Yes. Describe the hedges: roughly how long they are, which sides need cutting, how overgrown they are and how a tractor gets to them. Contractors covering Aberdeen City with a tractor-mounted hedge cutter get in touch with you directly. It’s free, and there’s no obligation to accept a quote.',
      },
      HEDGE_WHEN_FAQ,
    ],
  },
  aberdeenshire: {
    sections: [
      {
        kicker: 'Hedges',
        h2: 'Agricultural hedge cutting across Aberdeenshire.',
        body: [
          `Field hedges, roadside boundaries and shelter belts are cut with a tractor-mounted flail, from paddocks around Inverurie, Oldmeldrum and Balmedie to farm boundaries up the Don and Deveron. [Agricultural hedge cutting](/services/hedge-cutting) is the same job on a pony paddock or a whole farm. ${HEDGE_SEASON}`,
          HEDGE_BRIEF,
        ],
      },
    ],
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
    // GSC 2026-11 (Cheatcode): "seasonal tractor operators for hire in
    // cambridgeshire" at position 2, 27 impressions, no clicks.
    metaTitle: () => 'Tractor and Driver Hire in Cambridgeshire',
    metaDescription:
      'Describe the land job and a Cambridgeshire contractor brings the tractor, the implement and a driver, then sends a price. Wedding tractors too.',
    sections: [
      {
        kicker: 'Farm work',
        h2: 'Hiring a tractor and driver for farm and land work in Cambridgeshire.',
        body: [
          'Not every tractor enquiry here is for a wedding. If you need a tractor for work on the ground, whether that’s in Warboys, around Ramsey and Huntingdon, or further out across the Fens, the same network can help. The contractors covering Cambridgeshire are working farm and contracting businesses, and their tractors come with the implements they use every season: [toppers, flails](/services/flailing), harrows, rollers, rotavators and [trailers](/services/tractor-and-trailer-haulage). You describe the job, and the contractor brings the tractor, the kit and the person to drive it.',
          'That is usually the practical way to rent a tractor for farming: [tractor and driver hire](/services/tractor-and-driver-hire). You don’t have to source an implement, insure a machine or learn its controls on your own ground; you pay for the job done. [Tell us what needs doing](/start), roughly how much ground is involved, where it is and when you need it finished. Your enquiry goes to the contractors who cover your postcode, and whoever can fit it in comes back with a price. Work booked this way is covered by Emmerdale Agriculture’s own public liability policy.',
        ],
      },
      {
        // GSC 2026-11: "compact tractor hire for smallholdings cambridgeshire" at 6.6.
        kicker: 'Small sites',
        h2: 'Smaller tractors for smallholdings and paddocks in Cambridgeshire.',
        body: [
          'A few acres, a narrow gateway or a paddock reached down a shared track doesn’t always suit the large arable tractors common across Cambridgeshire. Plenty of contracting businesses also run a smaller or compact tractor for exactly this work: topping horse paddocks, harrowing, rolling, [rotavating a vegetable plot](/services/rotavating) or moving a trailer around a yard. A lighter machine turns in a tighter space, fits through older gates and is kinder to soft ground, which matters on Fen soils after rain.',
          'We can’t promise every contractor near you has a compact machine, so put the details in your enquiry. Give the gateway width if it’s tight, say whether access is over a lawn, a shared drive or a soft track, and roughly how big the area is. Contractors covering your postcode can then tell you what they would bring, whether that’s a compact tractor with a [topper](/services/paddock-topping) or [harrow](/services/paddock-harrowing), or a different way of doing the job. Small jobs are welcome, and grouping two or three tasks into one visit, such as topping then harrowing, is often the easiest way to make a short job worth the trip. If it’s routine paddock work you’re after, see [paddock contractors by county](/paddock-maintenance).',
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I rent a tractor to drive myself?',
        a: 'Jobs through the network are booked as a tractor with its contractor operating it, not as self-drive rental. For most farm and land work that’s simpler anyway: the contractor brings the right implement and does the job, and you pay for the work rather than the machine.',
      },
      {
        q: 'Can I get a compact tractor for a small plot or tight access?',
        a: 'Often, yes. Many contractors keep a smaller tractor for paddocks and smallholdings. Mention the gateway width, the ground conditions and how big the area is when you send your enquiry, and the contractors covering your postcode will tell you what they’d bring.',
      },
      {
        q: 'Is it worth booking a contractor for just an acre or two?',
        a: 'Yes. Small jobs come through the network all the time. If you have more than one task, such as topping and harrowing, asking for them together usually makes the visit more worthwhile for everyone.',
      },
    ],
  },
};
