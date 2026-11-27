/**
 * The year on grassland and paddocks, month by month (/info/calendar).
 *
 * Two kinds of line. `law` lines are dates set in regulation, checked against
 * the sources below on 2026-11-27; they are the part that must be right.
 * `jobs` lines are usual practice from AHDB, the BHS and the like: seasons
 * move with the weather and with how far north you are, and the page says so.
 * Nothing goes in here from memory: a line with no source stays out.
 */
export type Month = { name: string; law: string[]; jobs: string[] };

export const MONTHS: Month[] = [
  {
    name: 'January',
    law: [
      'Manufactured nitrogen stays closed on grass until 15 January in English Nitrate Vulnerable Zones and across Wales, until 31 January in Northern Ireland and until 15 February in Scottish NVZs.',
      'Slurry and other high-nitrogen organic manures stay closed until 31 January in English NVZs (sandy and shallow soils reopened on 31 December) and in Northern Ireland.',
    ],
    jobs: ['Hedge cutting, while the hedges are bare and before the closed period on 1 March.', 'Lime can go on in any month the ground will carry the spreader.'],
  },
  {
    name: 'February',
    law: ['Last month for cutting and trimming hedges in England: the closed period starts on 1 March.'],
    jobs: [
      'First nitrogen usually goes on from the middle of the month, once the soil has held 5°C at 10 cm for several days.',
      'Soil sampling before any fertiliser or lime goes on: every three to five years, and not within three months of either.',
    ],
  },
  {
    name: 'March',
    law: [
      'From 1 March to 31 August, no cutting or trimming of hedges on or beside farmland in England. Laying and coppicing may carry on until 30 April.',
      'Disturbing a nest that is in use or being built is an offence at any date, in any hedge, anywhere in the UK.',
    ],
    jobs: [
      'Chain harrowing once the ground has dried enough to travel. It does not replace picking up droppings.',
      'Rolling only where the ground needs it: on wet soil it compacts.',
      'Spring reseeding and overseeding start, as the soil warms and while there is moisture.',
    ],
  },
  {
    name: 'April',
    law: ['Hedge laying and coppicing end on 30 April in England.'],
    jobs: [
      'Fertiliser on growing grass.',
      'Spring reseeding and overseeding.',
      'Ragwort is sprayed at the rosette stage, in spring or autumn, while it is small and growing.',
    ],
  },
  {
    name: 'May',
    law: [],
    jobs: [
      'Docks are sprayed in late spring, at the rosette stage (150 to 250 mm across) and before they flower.',
      'Thistles are sprayed from May to July, while growing strongly and before they flower.',
      'First-cut silage, early to middle of the month.',
      'Last of the spring reseeding.',
    ],
  },
  {
    name: 'June',
    law: [],
    jobs: [
      'Topping, before weeds and grasses set seed.',
      'Thistle spraying continues.',
      'Ragwort: pull light infestations, roots and all, before it seeds. Do not cut it.',
      'Silage cuts follow at about 30 to 35 days.',
    ],
  },
  {
    name: 'July',
    law: [],
    jobs: ['Hay, usually in the middle to the end of the month.', 'Topping and thistle spraying continue.', 'Ragwort pulling before it seeds.'],
  },
  {
    name: 'August',
    law: ['Hedge cutting in England stays closed until 31 August.'],
    jobs: [
      'Autumn reseeding and overseeding start: most reseeds go in between August and October.',
      'Mixtures with red clover are best sown by the end of August.',
      'Dock regrowth is sprayed from late August into September.',
    ],
  },
  {
    name: 'September',
    law: [
      'Hedge cutting reopens in England on 1 September.',
      'Manufactured nitrogen closes on grass from 15 September: in English NVZs and all of Wales until 15 January, in Scottish NVZs until 15 February, in Northern Ireland until 31 January.',
      'In English NVZs, slurry and other high-nitrogen organic manures close on sandy and shallow grassland from 1 September to 31 December.',
    ],
    jobs: [
      'Mixtures with white clover are best sown by the end of September.',
      'Ragwort rosettes and dock regrowth are sprayed while still growing.',
      'Soil sampling and liming: autumn is the favoured season for lime.',
    ],
  },
  {
    name: 'October',
    law: [
      'In English NVZs, slurry and other high-nitrogen organic manures close on all other grassland from 15 October to 31 January. Northern Ireland closes on the same dates.',
      'Grass that qualifies for the NVZ exemption may have no manufactured nitrogen after 31 October.',
    ],
    jobs: ['Last of the autumn reseeding, earlier in the north.', 'Hedge cutting.', 'Liming.'],
  },
  {
    name: 'November',
    law: ['In English NVZs manufactured nitrogen has been closed on grass since 15 September, and slurry and other high-nitrogen organic manures since 15 October (1 September on sandy and shallow soils). Wales, Scotland and Northern Ireland have closed periods of their own in force too.'],
    jobs: ['Hedge cutting.', 'Straw-based farmyard manure is not caught by the slurry closed period, but still may not go on waterlogged, flooded, frozen or snow-covered ground.'],
  },
  {
    name: 'December',
    law: ['In English NVZs the slurry closed period on sandy and shallow soils ends on 31 December. The others run on into January.'],
    jobs: ['Hedge cutting.'],
  },
];

export const ALL_YEAR: string[] = [
  'Droppings picked up from horse paddocks at least twice a week.',
  'No fertiliser or manure on waterlogged, flooded or snow-covered ground, or ground frozen for more than 12 of the last 24 hours (Farming Rules for Water, England; the other nations have their own equivalents).',
  'Manufactured fertiliser kept 2 metres from surface water, and organic manure 10 metres from it and 50 metres from springs, wells and boreholes (English NVZ rules).',
];

export const CALENDAR_SOURCES: { label: string; href: string }[] = [
  { label: 'GOV.UK: hedgerow management rules, cutting and trimming', href: 'https://www.gov.uk/guidance/hedgerow-management-rules-cutting-and-trimming' },
  { label: 'GOV.UK: using nitrogen fertilisers in Nitrate Vulnerable Zones', href: 'https://www.gov.uk/guidance/using-nitrogen-fertilisers-in-nitrate-vulnerable-zones' },
  { label: 'GOV.UK: Farming Rules for Water', href: 'https://www.gov.uk/guidance/rules-for-farmers-and-land-managers-to-prevent-water-pollution' },
  { label: 'Wales: Water Resources (Control of Agricultural Pollution) Regulations 2021', href: 'https://www.legislation.gov.uk/wsi/2021/77/part/5' },
  { label: 'Scotland: NetRegs on Nitrate Vulnerable Zones', href: 'https://www.netregs.org.uk/environmental-topics/land/land-topics-for-agriculture/scotland-nitrate-vulnerable-zones-nvz/' },
  { label: 'Northern Ireland: DAERA on the closed period for chemical fertiliser', href: 'https://www.daera-ni.gov.uk/news/closed-spreading-period-chemical-fertiliser' },
  { label: 'Wildlife and Countryside Act 1981, section 1', href: 'https://www.legislation.gov.uk/ukpga/1981/69/section/1' },
  { label: 'AHDB: when to reseed grassland', href: 'https://ahdb.org.uk/knowledge-library/when-to-reseed-grassland-autumn-or-spring' },
  { label: 'AHDB: weed control in grassland reseeds', href: 'https://ahdb.org.uk/knowledge-library/grassland-reseeds-weed-control' },
  { label: 'AHDB: measuring soil nutrients, pH and organic matter', href: 'https://ahdb.org.uk/knowledge-library/measuring-soil-nutrients-ph-and-organic-matter' },
  { label: 'British Horse Society: grass management', href: 'https://www.bhs.org.uk/horse-care-and-welfare/health-care-management/pasture-management/grass-management/' },
];

/** 0 to 11 for the month it is in the UK. */
export function ukMonth(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'numeric' }).format(now)) - 1;
}
