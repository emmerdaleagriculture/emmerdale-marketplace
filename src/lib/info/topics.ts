/**
 * The Info section (2026-11-27): facts and tools for anyone doing land work,
 * reached from the (i) on the app's screens and from the website footer.
 *
 * One list drives the hub. A topic with `href` is built and linked; one
 * without is shown as on its way, so the hub says what the section is for
 * before every page exists. To add a page: build it under /info/<slug>, give
 * its entry here an `href`, and add it to the sitemap.
 */
export type InfoIcon = 'window' | 'calendar' | 'weed' | 'rates' | 'diary' | 'fertiliser' | 'seed';

export type InfoTopic = {
  slug: string;
  title: string;
  blurb: string;
  icon: InfoIcon;
  /** Set once the page exists. */
  href?: string;
};

export type InfoGroup = { title: string; topics: InfoTopic[] };

export const INFO_GROUPS: InfoGroup[] = [
  {
    title: 'Weather and timing',
    topics: [
      {
        slug: 'work-windows',
        title: 'Work windows',
        blurb: 'The next few days, hour by hour: when to spray, spread fertiliser or sow, from the forecast for your postcode.',
        icon: 'window',
        href: '/info/work-windows',
      },
      {
        slug: 'calendar',
        title: 'The year, month by month',
        blurb: 'Which jobs belong in which month, and the dates the law closes for hedges, slurry and nitrogen.',
        icon: 'calendar',
        href: '/info/calendar',
      },
    ],
  },
  {
    title: 'Spraying',
    topics: [
      {
        slug: 'weeds',
        title: 'Name that weed',
        blurb: 'Photograph a weed or pick it from the list, say whether horses or livestock graze the field, and see what controls it.',
        icon: 'weed',
      },
      {
        slug: 'spray-rates',
        title: 'Spray rates',
        blurb: 'Water volumes, dose per hectare and per acre, and how much to put in the tank for the area in front of you.',
        icon: 'rates',
      },
      {
        slug: 'spray-diary',
        title: 'Spray diary',
        blurb: 'The record the law asks you to keep: product, rate, field, weather and operator, saved as you finish the job.',
        icon: 'diary',
      },
    ],
  },
  {
    title: 'Soil and grass',
    topics: [
      {
        slug: 'fertiliser',
        title: 'Fertilising',
        blurb: 'What grass needs and when, reading a bag, and turning kilos per hectare into bags per acre.',
        icon: 'fertiliser',
      },
      {
        slug: 'seeding',
        title: 'Seeding',
        blurb: 'Seed rates for a new ley and for overseeding, the mixtures that suit horses, and when the soil is warm enough.',
        icon: 'seed',
      },
    ],
  },
];

export const INFO_TOPICS: InfoTopic[] = INFO_GROUPS.flatMap((g) => g.topics);

/** The pages that exist, for the sitemap and the "more in Info" links. */
export const LIVE_INFO_TOPICS: InfoTopic[] = INFO_TOPICS.filter((t) => t.href);
