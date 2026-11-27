/**
 * Info › Name that weed: the weeds of grassland and paddocks, and the
 * herbicides that control them.
 *
 * Every product figure was read on 2026-11-27 from the product's current UK
 * label, the maker's technical sheet, an HSE authorisation notice or the HSE
 * pesticides register. Nothing is from memory. A figure that could not be
 * found on one of those is left out, not guessed. Labels change and
 * authorisations end: `checked` is printed on the page, and this file needs
 * going through again each spring.
 *
 * How sure we are that a product controls a weed is kept with every pairing:
 *   label — the weed is named on the product's label
 *   maker — the maker's technical sheet rates it, but it is not a label claim
 *   chart — the maker's sales chart gives it two or three stars ("indications only")
 * The page shows which, because only the first is a claim the maker stands behind in law.
 */

export const WEEDS_CHECKED = '27 November 2026';

export type Product = {
  slug: string;
  name: string;
  maker: string;
  actives: string;
  mapp: string;
  /** How it may be put on. */
  method: string;
  dose: string;
  water?: string;
  /** A knapsack or spot rate, where the label or the maker gives one. */
  knapsack?: string;
  /** Dates or stages the label confines it to. */
  window?: string;
  rainfast?: string;
  /** Days stock stay out, as a headline; the wording follows. */
  stockDays: number | null;
  stock: string;
  cutting?: string;
  clover: string;
  /** May it be used where horses graze? */
  horses: 'yes' | 'no';
  /** Why not, in the label's words, or what the maker says about horses. */
  horseNote?: string;
  manure?: string;
  buffer?: string;
  /** Anything else that must be said: an authorisation ending, a figure's weaker source. */
  note?: string;
  url: string;
};

/** The paragraph nearly every label carries about ragwort. */
export const RAGWORT_RULE =
  'If there is ragwort in the sward, stock stay out until it has completely recovered or died and no sign of the dead plant is left, however long that takes. Sprayed ragwort is more palatable and more toxic, and must not go into hay or silage.';

export const PRODUCTS: Product[] = [
  {
    slug: 'doxstar-pro',
    name: 'Doxstar Pro',
    maker: 'Corteva',
    actives: 'fluroxypyr 150 g/L + triclopyr 150 g/L',
    mapp: '15664',
    method: 'Boom sprayer only: the label forbids hand-held equipment.',
    dose: '2.0 L/ha, and no more than 2.0 L/ha in a year',
    water: '300 to 400 L/ha (200 L/ha with low-drift nozzles)',
    window: 'Established grassland, more than a year old.',
    rainfast: 'Control may be reduced if rain falls within 2 hours.',
    stockDays: 7,
    stock: 'Keep livestock out during treatment and for at least 7 days after.',
    cutting: 'Do not cut grass for 28 days after application.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'yes',
    buffer: '5 m from water with a boom (LERAP B); 1 m from a dry ditch.',
    note: 'Pas, one half of Corteva’s Pas·Tor pack (MAPP 17772), is the same mixture; its label also allows 1.0 L/ha in spring followed by 1.0 L/ha in autumn.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/doxstar-pro.html',
  },
  {
    slug: 'grazon-pro',
    name: 'Grazon Pro',
    maker: 'Corteva',
    actives: 'clopyralid 60 g/L + triclopyr 240 g/L',
    mapp: '19875',
    method: 'Knapsack or other hand-held sprayer only: the label forbids a boom. Spot treatment.',
    dose: '60 ml in 10 litres of water, and no more than 200 litres of mixed spray to a hectare; one treatment a year',
    knapsack: '60 ml in 10 L of water (a 15 L fill takes 90 ml).',
    window: 'Only between 1 March and 31 October. Established grassland, at least a year old.',
    rainfast: '2 hours.',
    stockDays: 7,
    stock: 'Keep livestock and horses out during treatment and for at least 7 days after, and until the foliage of any poisonous weed has died and become unpalatable.',
    cutting: 'Do not cut grass for 28 days after application.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'yes',
    manure: 'Do not compost or mulch treated plants, or manure from animals fed on treated crops, and do not spray on or around muck heaps.',
    buffer: '1 m from water with hand-held equipment (LERAP B).',
    note: 'Nufarm’s Nettlex 60 (MAPP 20888) is the same mixture at the same rate.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/grazon-pro.html',
  },
  {
    slug: 'envy',
    name: 'Envy',
    maker: 'Corteva',
    actives: 'florasulam 2.5 g/L + fluroxypyr 100 g/L',
    mapp: '17901',
    method: 'Boom sprayer or knapsack.',
    dose: '2.0 L/ha on established grassland, 1.5 L/ha on new leys; one treatment a year',
    water: '150 to 400 L/ha',
    knapsack: '20 ml in 2 litres of water for every 100 m² (the established-grass rate).',
    window: 'Between 1 February and 30 November.',
    rainfast: '2 hours.',
    stockDays: 7,
    stock: 'Livestock must be kept out of treated areas for at least 7 days following treatment.',
    cutting: 'Do not cut grass for 4 weeks after application.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'yes',
    horseNote: 'Corteva says Envy can be used where horses, cattle or sheep graze, with no herbicide residue concerns in the manure.',
    buffer: '5 m from water with a boom (LERAP B); 1 m hand-held.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/envy.html',
  },
  {
    slug: 'prograss',
    name: 'ProGrass',
    maker: 'Corteva',
    actives: 'halauxifen-methyl 6.7 g/L + fluroxypyr 200 g/L + triclopyr 200 g/L',
    mapp: '21097',
    method: 'Boom sprayer only: the label forbids hand-held equipment.',
    dose: '1.5 L/ha, one treatment a year',
    water: '200 L/ha, through three-star drift-reducing nozzles',
    window: 'Only between 1 March and 31 October. Established grassland.',
    rainfast: '2 hours.',
    stockDays: 7,
    stock: 'Keep livestock out for at least 7 days after treatment.',
    cutting: 'May be cut after 7 days, but wait at least 21 days before cutting for hay, haylage or silage for the best control.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'yes',
    buffer: '12 m from water, which a LERAP cannot reduce.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/prograss.html',
  },
  {
    slug: 'squire-ultra',
    name: 'Squire Ultra',
    maker: 'Bayer',
    actives: 'amidosulfuron 75% w/w',
    mapp: '20707',
    method: 'Boom sprayer. Nufarm’s chart gives a knapsack rate; Bayer’s label does not.',
    dose: '60 g/ha, and no more than 60 g/ha in a year',
    water: '200 to 400 L/ha',
    knapsack: '3 g in 10 L of water to treat 500 m² (Nufarm’s chart).',
    window: 'Permanent grass 1 February to 15 October; rotational grass 1 February to 30 June.',
    stockDays: 7,
    stock: 'Keep livestock out of treated areas for at least 7 days after treatment and until foliage of any poisonous weed such as ragwort has died and become unpalatable.',
    cutting: 'Do not cut for hay or silage for at least 21 days following treatment.',
    clover: 'Safe to white clover. Avoid swards with red clover.',
    horses: 'yes',
    note: 'The authorisation ends on 30 November 2027; stocks may be used until 31 May 2029.',
    url: 'https://cropscience.bayer.co.uk/our-products/herbicides/squire-ultra',
  },
  {
    slug: 'thistlex',
    name: 'Thistlex',
    maker: 'Corteva',
    actives: 'clopyralid 200 g/L + triclopyr 200 g/L',
    mapp: '19876',
    method: 'Boom sprayer only: the label forbids hand-held equipment.',
    dose: '1.0 L/ha, and no more than 1.0 L/ha in a year',
    water: '200 to 400 L/ha',
    window: 'Only between 1 March and 31 October. Established grassland for grazing only.',
    rainfast: '2 hours.',
    stockDays: 7,
    stock: 'Keep livestock out during treatment and for at least 7 days after.',
    cutting: 'Must not be cut for hay, haylage or silage within 12 months of treatment.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'no',
    horseNote: 'The label: “Do not use on grassland which will be grazed by horses and ponies.”',
    manure: 'Manure from stock on treated grass must stay on the farm, and never go to gardeners, allotments or compost makers.',
    buffer: '5 m from water (LERAP B).',
    note: 'Tor, the other half of the Pas·Tor pack (MAPP 19958), is the same mixture with the same restrictions.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/thistlex.html',
  },
  {
    slug: 'thistlex-pro',
    name: 'Thistlex Pro',
    maker: 'Corteva',
    actives: 'clopyralid 120 g/L + halauxifen-methyl 5 g/L',
    mapp: '21489',
    method: 'Boom sprayer only, through three-star drift-reducing equipment.',
    dose: '1.67 L/ha, one treatment a year',
    water: '200 to 400 L/ha',
    window: 'Not from 1 August to the end of February. A March or July application may only be made every two years. Established grassland for grazing only, over a year old.',
    rainfast: '4 hours.',
    stockDays: 14,
    stock: 'Keep livestock out for at least 14 days following treatment.',
    cutting: 'No fresh grass, silage, hay or haylage from treated ground within 12 months.',
    clover: 'Not found on the label we read: assume clover is damaged.',
    horses: 'no',
    horseNote: 'The label: “Do not use on grassland that will be grazed by horses and ponies.”',
    manure: 'Manure from stock on treated grass must not leave the farm.',
    buffer: '6 m from water, which a LERAP cannot reduce.',
    url: 'https://www.corteva.co.uk/content/dam/dpagco/corteva/eu/gb/en/files/labels/Thistlex-Pro-label.pdf',
  },
  {
    slug: 'leystar',
    name: 'Leystar',
    maker: 'Corteva',
    actives: 'clopyralid 80 g/L + florasulam 2.5 g/L + fluroxypyr 100 g/L',
    mapp: '21140',
    method: 'Boom sprayer or knapsack.',
    dose: '2.0 L/ha on established grassland (1 February to 30 September); 1.0 L/ha on new leys (to 31 August); one treatment a year',
    water: '150 to 400 L/ha',
    window: 'Established grassland for grazing only, and newly sown leys.',
    rainfast: '2 hours.',
    stockDays: 7,
    stock: 'Keep livestock out for at least 7 days after treatment.',
    cutting: '12 months must pass from treatment before making silage, hay or haylage.',
    clover: 'Clover will be killed or severely checked.',
    horses: 'no',
    horseNote: 'The label: “Do not use on grassland that will be grazed by horses and ponies.”',
    manure: 'Manure from stock on treated grass must not leave the farm.',
    buffer: '5 m from water on established grassland.',
    note: 'Older stock carries MAPP 19938.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/leystar.html',
  },
  {
    slug: 'forefront-t',
    name: 'Forefront T',
    maker: 'Corteva',
    actives: 'aminopyralid 30 g/L + triclopyr 240 g/L',
    mapp: '15568',
    method: 'Boom sprayer only: the label forbids hand-held equipment. It may only be recommended by a BASIS agronomist who has done the stewardship training.',
    dose: '2.0 L/ha, one treatment a year',
    water: '200 L/ha (250 to 300 where weeds are dense)',
    window: 'Established grassland for grazing only. Not on leys under a year old.',
    rainfast: 'Control may be reduced if rain falls within 1 hour.',
    stockDays: 7,
    stock: 'Livestock must be kept out of treated areas for at least 1 week following treatment and until poisonous weeds such as ragwort have died and become unpalatable.',
    cutting: 'Must not be cut for hay, haylage or silage in the calendar year of treatment.',
    clover: 'Clover is killed. Do not drill clover within 4 months.',
    horses: 'no',
    horseNote: 'The label: “Do not use on grassland that will be grazed by animals other than cattle and sheep.”',
    manure: 'Manure from stock on treated grass should not leave the farm: no sale or supply to gardeners, allotments or compost makers under any circumstances.',
    buffer: '5 m from water (LERAP B).',
    note: 'Being withdrawn. The authorisation ended on 15 December 2025; stocks may be sold until 31 May 2027 and used until 30 September 2027.',
    url: 'https://www.corteva.co.uk/products-and-solutions/crop-protection/forefront-t.html',
  },
  {
    slug: 'thrust',
    name: 'Thrust',
    maker: 'Nufarm',
    actives: '2,4-D 344 g/L + dicamba 120 g/L',
    mapp: '15408',
    method: 'Boom sprayer or knapsack.',
    dose: '2.5 to 3.5 L/ha (Nufarm’s chart)',
    knapsack: '90 ml in 10 L of water, sprayed to just before run-off (Nufarm’s chart).',
    window: 'April to September. Established grassland.',
    stockDays: 14,
    stock: 'Keep stock out for 14 days (Nufarm’s chart).',
    cutting: 'Cut after 3 weeks (Nufarm’s chart).',
    clover: 'Not safe to clover.',
    horses: 'yes',
    note: 'We could not read this product’s label: the figures are from Nufarm’s 2026 grassland chart. Check the label for the maximum dose and the exact stock wording before use.',
    url: 'https://cdn.nufarm.com/wp-content/uploads/sites/26/2026/02/04101431/Nufarm-Grassland-Leaflet-2026_Digital.pdf',
  },
  {
    slug: 'depitox',
    name: 'Depitox 500',
    maker: 'Nufarm',
    actives: '2,4-D 500 g/L',
    mapp: '17597',
    method: 'Boom sprayer or knapsack.',
    dose: 'Up to 3.3 L/ha, one treatment a year on grassland',
    knapsack: '165 ml in 10 L of water to treat 500 m² (Nufarm’s chart).',
    window: 'Grass at least 12 months old.',
    stockDays: 14,
    stock: 'Livestock must be kept out of treated areas for at least two weeks following treatment and until poisonous weeds such as ragwort have died and become unpalatable.',
    cutting: 'Cut after 3 weeks (Nufarm’s chart).',
    clover: 'Not safe to clover.',
    horses: 'yes',
    url: 'https://cdn.nufarm.com/wp-content/uploads/sites/26/2026/02/04101431/Nufarm-Grassland-Leaflet-2026_Digital.pdf',
  },
  {
    slug: 'polo',
    name: 'Polo',
    maker: 'Nufarm',
    actives: '2,4-D 360 g/L + MCPA 315 g/L',
    mapp: '19599',
    method: 'Boom sprayer only: not by hand-held equipment.',
    dose: 'Up to 3.5 L/ha, one treatment a year',
    water: '200 L/ha (Nufarm’s chart)',
    window: 'Not before the end of February. New leys April to 31 August, and established grass.',
    stockDays: 14,
    stock: 'Livestock must be kept out of treated areas for at least 2 weeks following treatment and until poisonous weeds such as ragwort have died and become unpalatable.',
    cutting: 'Cut after 3 weeks (Nufarm’s chart).',
    clover: 'Not safe to clover.',
    horses: 'yes',
    note: 'Formerly Headland Polo.',
    url: 'https://cdn.nufarm.com/wp-content/uploads/sites/26/2026/02/04101431/Nufarm-Grassland-Leaflet-2026_Digital.pdf',
  },
  {
    slug: 'agritox',
    name: 'Agritox',
    maker: 'Nufarm',
    actives: 'MCPA 500 g/L',
    mapp: '14894',
    method: 'Boom sprayer only: not by hand-held equipment.',
    dose: 'Up to 3.3 L/ha at a time, 6.6 L/ha in a year',
    water: 'No less than 200 L/ha',
    window: 'Not before the end of February. Established grass over a year old. Not on waterlogged ground.',
    stockDays: 14,
    stock: 'Livestock must be kept out of treated areas until poisonous weeds such as ragwort have died and become unpalatable. Nufarm’s chart gives 14 days.',
    cutting: 'Cut after 3 weeks (Nufarm’s chart).',
    clover: 'Not safe to clover.',
    horses: 'yes',
    buffer: '5 m from water (LERAP B).',
    note: 'The authorisation ends on 15 August 2027; stocks may be used until 15 February 2029.',
    url: 'https://cdn.nufarm.com/wp-content/uploads/sites/26/2026/02/04101431/Nufarm-Grassland-Leaflet-2026_Digital.pdf',
  },
  {
    slug: 'roundup-flex',
    name: 'Roundup Flex (weed wiper)',
    maker: 'Bayer',
    actives: 'glyphosate 480 g/L',
    mapp: '21233',
    method: 'Weed wiper, on weeds standing clear of the grass. Glyphosate kills whatever it touches, grass included.',
    dose: 'One part product to two of water in a wick-type wiper (one to three in hot, dry weather). For newer wipers, the wiper maker’s dilution.',
    window: 'Weeds must stand at least 10 cm above the grass, and the wiper 5 cm above it. Wipe dense patches twice, in opposite directions.',
    rainfast: 'From 1 hour.',
    stockDays: null,
    stock: 'Treated poisonous weeds must be removed, or allowed to rot away completely, before stock go back or the field is cut.',
    clover: 'Kills clover and grass wherever it touches.',
    horses: 'yes',
    horseNote: 'The label’s 5-day grazing interval after an overall spray names cattle and sheep; it says nothing of horses.',
    url: 'https://cropscience.bayer.co.uk/our-products/herbicides/roundup-flex',
  },
];

export type Basis = 'label' | 'maker' | 'chart';
export type Option = { product: string; basis: Basis; note?: string };

export type Weed = {
  slug: string;
  name: string;
  latin: string;
  /** One of the five weeds the Weeds Act 1959 lets a landowner be ordered to control. */
  injurious?: boolean;
  /** Set only where a source we read says so. */
  poison?: string;
  /** When to treat. */
  timing: string;
  /** What to do without a sprayer, where the guidance says. */
  without?: string;
  /** A warning that belongs above everything else. */
  warning?: string;
  options: Option[];
};

export const WEEDS: Weed[] = [
  {
    slug: 'broad-leaved-dock',
    name: 'Broad-leaved dock',
    latin: 'Rumex obtusifolius',
    injurious: true,
    timing: 'Spray the rosette while it is growing hard, 20 to 25 cm across and before the flowering stem comes: late spring is best, or the regrowth in autumn. After topping, let it regrow for two or three weeks first.',
    options: [
      { product: 'doxstar-pro', basis: 'label', note: 'Rosettes up to 200 mm.' },
      { product: 'prograss', basis: 'label', note: 'Rosettes up to 250 mm.' },
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment in spring, rosettes up to 25 cm.' },
      { product: 'squire-ultra', basis: 'label', note: 'All docks, seedling to full rosette. The one that spares white clover.' },
      { product: 'forefront-t', basis: 'label' },
      { product: 'envy', basis: 'maker', note: 'Moderately susceptible, up to 200 mm.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'curled-dock',
    name: 'Curled dock',
    latin: 'Rumex crispus',
    injurious: true,
    timing: 'As for broad-leaved dock: the rosette, growing hard, before the flowering stem.',
    options: [
      { product: 'doxstar-pro', basis: 'label', note: 'On the label, though Corteva rates it only moderately susceptible.' },
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment in spring.' },
      { product: 'squire-ultra', basis: 'label', note: 'All docks, seedling to full rosette. Spares white clover.' },
      { product: 'leystar', basis: 'label', note: '2.0 L/ha at the rosette.' },
      { product: 'forefront-t', basis: 'label' },
      { product: 'prograss', basis: 'maker', note: 'Moderately susceptible.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'creeping-thistle',
    name: 'Creeping thistle',
    latin: 'Cirsium arvense',
    injurious: true,
    timing: 'Spray the rosette, up to 20 cm, before the stem runs up: usually May to July. If it is already flowering, cut it and spray the regrowth two or three weeks later.',
    without: 'Topping before it flowers stops it seeding but will not kill it: it spreads by its roots.',
    options: [
      { product: 'thistlex', basis: 'label', note: 'Rosettes up to 200 mm.' },
      { product: 'thistlex-pro', basis: 'label', note: 'Up to 30 cm.' },
      { product: 'forefront-t', basis: 'label' },
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment before the flowering spikes are 15 cm.' },
      { product: 'thrust', basis: 'chart' },
      { product: 'polo', basis: 'chart' },
      { product: 'agritox', basis: 'chart' },
    ],
  },
  {
    slug: 'spear-thistle',
    name: 'Spear thistle',
    latin: 'Cirsium vulgare',
    injurious: true,
    timing: 'Spray the rosette, up to 25 cm, before the stem runs up.',
    options: [
      { product: 'forefront-t', basis: 'label', note: 'Rosettes up to 25 cm.' },
      { product: 'grazon-pro', basis: 'maker', note: 'Spot treatment.' },
      { product: 'thistlex', basis: 'maker' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'common-nettle',
    name: 'Common nettle',
    latin: 'Urtica dioica',
    timing: 'Spray while it is growing hard and before it flowers, normally by the middle of June, at up to 30 cm.',
    options: [
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment before flowering.' },
      { product: 'prograss', basis: 'label' },
      { product: 'forefront-t', basis: 'label', note: 'Up to 30 cm.' },
      { product: 'doxstar-pro', basis: 'maker', note: 'Moderately susceptible.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'creeping-buttercup',
    name: 'Creeping buttercup',
    latin: 'Ranunculus repens',
    timing: 'Spray at the rosette, before it flowers.',
    options: [
      { product: 'envy', basis: 'label', note: '2.0 L/ha on established grass.' },
      { product: 'prograss', basis: 'label' },
      { product: 'leystar', basis: 'label', note: '2.0 L/ha.' },
      { product: 'thistlex-pro', basis: 'label', note: 'Before flowering.' },
      { product: 'forefront-t', basis: 'label', note: 'Before flowering.' },
      { product: 'depitox', basis: 'chart' },
      { product: 'polo', basis: 'chart' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'common-ragwort',
    name: 'Common ragwort',
    latin: 'Jacobaea vulgaris',
    injurious: true,
    poison:
      'Poisonous to horses and livestock: it destroys the liver, and it stays poisonous dried in hay. Wilted or sprayed plants are more palatable than standing ones.',
    warning:
      'Whatever you do to ragwort, stock stay off until every plant has rotted away or been carted off. The Code of Practice: “It is only safe to graze fields once any ragwort and other toxic weeds present have disintegrated and are not accessible to grazing animals.” If you keep horses or livestock you must not graze them on land where you know ragwort is present.',
    timing: 'Spray at the rosette, up to 20 cm, in spring or autumn, before the stem runs up. Spraying a mature plant is unlikely to work.',
    without:
      'Pull or lever it out, root and all, when the soil is damp and before it has seeded, and take the plants away. The Code of Practice calls cutting a control method of last resort.',
    options: [
      { product: 'forefront-t', basis: 'label', note: 'Rosettes up to 20 cm. Cattle and sheep only.' },
      { product: 'roundup-flex', basis: 'label', note: 'Wiped onto plants standing above the grass.' },
      { product: 'thrust', basis: 'chart' },
      { product: 'polo', basis: 'chart' },
      { product: 'depitox', basis: 'chart' },
      { product: 'agritox', basis: 'chart' },
    ],
  },
  {
    slug: 'chickweed',
    name: 'Common chickweed',
    latin: 'Stellaria media',
    timing: 'Spray while it is small and growing, before it flowers.',
    without: 'Hard grazing and harrowing check it. Topping does not.',
    options: [
      { product: 'envy', basis: 'label', note: '1.0 L/ha on new leys, up to flowering.' },
      { product: 'doxstar-pro', basis: 'maker' },
      { product: 'prograss', basis: 'maker' },
      { product: 'leystar', basis: 'maker' },
    ],
  },
  {
    slug: 'dandelion',
    name: 'Dandelion',
    latin: 'Taraxacum officinale',
    timing: 'Spray at the rosette, before the flower bud shows.',
    options: [
      { product: 'envy', basis: 'label', note: '2.0 L/ha on established grass.' },
      { product: 'prograss', basis: 'label' },
      { product: 'leystar', basis: 'label', note: '1.5 L/ha.' },
      { product: 'thistlex-pro', basis: 'label' },
      { product: 'forefront-t', basis: 'label', note: 'Before the flower bud.' },
      { product: 'doxstar-pro', basis: 'maker' },
    ],
  },
  {
    slug: 'soft-rush',
    name: 'Soft rush',
    latin: 'Juncus effusus',
    timing: 'Top or mow before it seeds, then treat the fresh green regrowth at about 15 cm, in early to middle summer. Not on waterlogged ground.',
    options: [
      { product: 'roundup-flex', basis: 'label', note: 'Wiped onto rushes standing above the grass.' },
      { product: 'polo', basis: 'chart' },
      { product: 'agritox', basis: 'chart', note: 'Nufarm sells it for thistles and soft rush.' },
    ],
  },
  {
    slug: 'bracken',
    name: 'Bracken',
    latin: 'Pteridium aquilinum',
    timing: 'Treat when the fronds are fully open.',
    without: 'Rolling, bruising or cutting.',
    warning:
      'Asulox (asulam), the old bracken spray, is gone: there is no asulam product on the register and its maker has stopped work on it, so no emergency authorisation can be expected.',
    options: [
      { product: 'roundup-flex', basis: 'label', note: 'At full frond expansion. It kills the grass under it too.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'hogweed',
    name: 'Hogweed',
    latin: 'Heracleum sphondylium',
    timing: 'Spray at the rosette, up to 25 cm.',
    options: [
      { product: 'prograss', basis: 'label' },
      { product: 'forefront-t', basis: 'maker', note: 'Moderately susceptible.' },
    ],
  },
  {
    slug: 'cow-parsley',
    name: 'Cow parsley',
    latin: 'Anthriscus sylvestris',
    timing: 'Spray at the rosette, up to 25 cm.',
    options: [
      { product: 'prograss', basis: 'label' },
      { product: 'grazon-pro', basis: 'maker', note: 'Moderately susceptible. Spot treatment.' },
      { product: 'forefront-t', basis: 'maker', note: 'Moderately susceptible.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'plantain',
    name: 'Plantain',
    latin: 'Plantago lanceolata and P. major',
    timing: 'Spray at the rosette. Ribwort (narrow leaf) and greater plantain (broad leaf) do not respond alike: check which you have.',
    options: [
      { product: 'leystar', basis: 'label', note: 'Both, at 2.0 L/ha.' },
      { product: 'prograss', basis: 'label', note: 'Ribwort plantain.' },
      { product: 'envy', basis: 'maker', note: 'Greater plantain moderately susceptible; ribwort less so.' },
      { product: 'depitox', basis: 'chart' },
      { product: 'polo', basis: 'chart' },
      { product: 'agritox', basis: 'chart' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'bramble',
    name: 'Bramble',
    latin: 'Rubus fruticosus',
    timing: 'Spray from June to August, while it is growing hard, and wet all the foliage.',
    options: [
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment, June to August.' },
      { product: 'doxstar-pro', basis: 'maker', note: 'Moderately susceptible.' },
      { product: 'thrust', basis: 'chart' },
    ],
  },
  {
    slug: 'gorse-and-broom',
    name: 'Gorse and broom',
    latin: 'Ulex europaeus and Cytisus scoparius',
    timing: 'Spray from June to August, while growing hard.',
    options: [
      { product: 'grazon-pro', basis: 'label', note: 'Spot treatment, June to August.' },
      { product: 'doxstar-pro', basis: 'maker', note: 'Broom susceptible; gorse moderately.' },
    ],
  },
  {
    slug: 'sycamore-seedlings',
    name: 'Sycamore seedlings',
    latin: 'Acer pseudoplatanus',
    poison:
      'Sycamore seeds in autumn and seedlings in spring carry hypoglycin A, which causes atypical myopathy in horses.',
    warning:
      'Spraying does not make a paddock safe. The British Horse Society: “both mowing and spraying doesn’t eliminate the risk of poisoning and seedlings need to be removed from the pasture.” The toxin is still in sprayed seedlings six to eight months later, and harrowing has been found to increase the risk.',
    timing: 'Seedlings come up in spring from the seed that fell in autumn.',
    without:
      'Pick up or fence off seeds and leaves in autumn, remove the seedlings in spring, and make no hay from it. The BHS suggests limiting grazing to under six hours a day where the risk cannot be removed.',
    options: [
      { product: 'thrust', basis: 'chart' },
      { product: 'depitox', basis: 'chart' },
    ],
  },
];

/** Other plants the British Horse Society lists as poisonous to horses: none has treatment notes here. */
export const ALSO_POISONOUS = ['foxglove', 'hemlock', 'yew', 'oak and acorns', 'deadly nightshade', 'laburnum', 'ivy', 'hemlock water dropwort'];

export const BASIS_LABEL: Record<Basis, string> = {
  label: 'On the label',
  maker: 'Maker’s rating',
  chart: 'Maker’s chart',
};

export type Stock = 'horses' | 'livestock' | 'none';

const bySlug = new Map(PRODUCTS.map((p) => [p.slug, p]));
export const productOf = (slug: string): Product => {
  const p = bySlug.get(slug);
  if (!p) throw new Error(`weeds.ts: no product "${slug}"`);
  return p;
};

/** A weed's options split by what grazes the field: usable, and ruled out with the reason. */
export function optionsFor(weed: Weed, stock: Stock): { usable: Option[]; ruledOut: Option[] } {
  const usable: Option[] = [];
  const ruledOut: Option[] = [];
  for (const o of weed.options) (stock === 'horses' && productOf(o.product).horses === 'no' ? ruledOut : usable).push(o);
  return { usable, ruledOut };
}
