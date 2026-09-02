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
    slug: 'weed-control',
    name: 'Weed control & spraying',
    label: 'weed control and spraying',
    blurb: 'Targeted treatment by licensed, certificated operators only.',
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
    slug: 'rotavating',
    name: 'Rotavating',
    label: 'rotavating',
    blurb: 'Ground broken and turned for reseeding or new use.',
    icon: 'rotavating',
  },
  {
    slug: 'mole-ploughing',
    name: 'Mole ploughing & stone burying',
    label: 'mole ploughing and stone burying',
    blurb: 'Drainage runs and stony ground dealt with properly.',
    icon: 'mole',
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
