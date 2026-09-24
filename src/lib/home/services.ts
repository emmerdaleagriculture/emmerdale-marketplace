import type { ServiceIconKey } from '@/components/home/ServiceIcons';

/**
 * The front-page service board. Presentational copy for the home page only —
 * the matching taxonomy (the `services` table) is what jobs are actually
 * tagged with. No prices on the board: every card leads to the job form.
 */
export type HomeService = {
  slug: string;
  name: string;
  /** Lower-case form for the visually-hidden link label ("… for hedge cutting"). */
  label: string;
  blurb: string;
  icon: ServiceIconKey;
};

export const HOME_SERVICES: HomeService[] = [
  {
    slug: 'topping',
    name: 'Paddock topping',
    label: 'paddock topping',
    blurb: 'Rough grass and thistles cut back before turn-out or in the autumn.',
    icon: 'topping',
  },
  {
    slug: 'mowing',
    name: 'Finish mowing',
    label: 'finish mowing',
    blurb: 'A clean, even cut for paddocks, orchards and amenity grass.',
    icon: 'mowing',
  },
  {
    slug: 'harrowing',
    name: 'Harrowing',
    label: 'harrowing',
    blurb: 'Break up thatch, spread muck, level the surface.',
    icon: 'harrowing',
  },
  {
    slug: 'rolling',
    name: 'Rolling',
    label: 'rolling',
    blurb: 'Firm the ground, press stones back down after harrowing.',
    icon: 'rolling',
  },
  {
    slug: 'muck-sweeping',
    name: 'Muck sweeping',
    label: 'muck sweeping',
    blurb: 'Mechanical sweep, ideal after winter turn-out.',
    icon: 'muck_sweeping',
  },
  {
    slug: 'overseeding',
    name: 'Overseeding',
    label: 'overseeding',
    blurb: 'Repair thin or worn paddocks with fresh seed.',
    icon: 'overseeding',
  },
  {
    slug: 'hedge-cutting',
    name: 'Hedge cutting',
    label: 'hedge cutting',
    blurb: 'Field and boundary hedges cut and shaped, arisings cleared.',
    icon: 'hedge',
  },
  {
    slug: 'land-clearance',
    name: 'Land & ditch clearance',
    label: 'land and ditch clearance',
    blurb: 'Overgrown ground, scrub and ditches brought back under control.',
    icon: 'clearance',
  },
  {
    slug: 'flailing',
    name: 'Flailing',
    label: 'flailing',
    blurb: 'Heavy flail through rough grass, scrub and brambles, cut and left.',
    icon: 'flail',
  },
  {
    slug: 'flail-collecting',
    name: 'Flail collecting',
    label: 'flail collecting',
    blurb: 'Rough grass and scrub cut and collected, not left to rot down.',
    icon: 'flail_collect',
  },
  {
    slug: 'weed-control',
    name: 'Weed control & spraying',
    label: 'weed control and spraying',
    blurb: 'Targeted treatment of docks, nettles, thistles and ragwort.',
    icon: 'spraying',
  },
  {
    slug: 'fertiliser',
    name: 'Fertiliser application',
    label: 'fertiliser application',
    blurb: 'Spread evenly, at the right rate, at the right time of year.',
    icon: 'fertiliser',
  },
  {
    slug: 'lime-spreading',
    name: 'Lime spreading',
    label: 'lime spreading',
    blurb: 'Lime spread to correct soil pH on grassland or arable.',
    icon: 'lime',
  },
  {
    slug: 'scarifying',
    name: 'Scarifying',
    label: 'scarifying',
    blurb: 'Thatch and moss raked out so the grass can breathe.',
    icon: 'scarify',
  },
  {
    slug: 'sub-soiling',
    name: 'Sub-soiling',
    label: 'sub-soiling',
    blurb: 'Compacted ground broken up so water drains and roots go down.',
    icon: 'subsoil',
  },
  {
    slug: 'rotavating',
    name: 'Rotavating',
    label: 'rotavating',
    blurb: 'Ground broken and turned for reseeding or new use.',
    icon: 'rotavating',
  },
  {
    slug: 'mole-ploughing',
    name: 'Mole ploughing',
    label: 'mole ploughing',
    blurb: 'Drainage channels pulled under wet ground.',
    icon: 'mole',
  },
  {
    slug: 'stone-burying',
    name: 'Stone burying',
    label: 'stone burying',
    blurb: 'Stones buried to leave a clean, level seedbed.',
    icon: 'stones',
  },
  {
    slug: 'tree-felling',
    name: 'Tree felling & chipping',
    label: 'tree felling and chipping',
    blurb: 'Trees felled and the brash chipped or cleared away.',
    icon: 'tree',
  },
  {
    slug: 'fixed-tooth-mulching',
    name: 'Fixed tooth mulching',
    label: 'fixed tooth mulching',
    blurb: 'Scrub, saplings and stumps ground down to mulch in one pass.',
    icon: 'mulcher',
  },
  {
    slug: 'mounding',
    name: 'Mounding',
    label: 'mounding',
    blurb: 'Ground mounded with an excavator, ready for tree planting.',
    icon: 'mounds',
  },
  {
    slug: 'excavator-work',
    name: 'Excavator work',
    label: 'excavator work',
    blurb: 'Digger and driver for trenches, footings, ponds and spoil.',
    icon: 'excavator',
  },
  {
    slug: 'road-grading',
    name: 'Road grading',
    label: 'road grading',
    blurb: 'Farm tracks and drives regraded, potholes filled, camber back.',
    icon: 'grader',
  },
  {
    slug: 'road-construction',
    name: 'Road construction/repair',
    label: 'road construction and repair',
    blurb: 'Tracks and access roads built or repaired, stoned and surfaced.',
    icon: 'road',
  },
  {
    slug: 'general-tractor-work',
    name: 'General tractor work',
    label: 'general tractor work',
    blurb: 'Tractor and driver for the jobs that don’t fit a list.',
    icon: 'tractor',
  },
  {
    slug: 'trailer-work',
    name: 'Trailer work',
    label: 'trailer work',
    blurb: 'Bales, muck, timber or spoil carted where it needs to go.',
    icon: 'trailer',
  },
  {
    slug: 'fencing',
    name: 'Fencing',
    label: 'fencing',
    blurb: 'Post-and-rail, stock and equestrian fencing, supplied and fitted.',
    icon: 'fencing',
  },
  {
    slug: 'tractor-hire',
    name: 'Tractor hire (events)',
    label: 'tractor hire',
    blurb: 'Tractor and driver for shows, weddings and events.',
    icon: 'tractor_hire',
  },
];

/** The everyday jobs the footer lists, in board order. */
export const FOOTER_HOME_SERVICES = HOME_SERVICES.slice(0, 6);
