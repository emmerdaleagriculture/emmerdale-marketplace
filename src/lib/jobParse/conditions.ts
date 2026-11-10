import type { AreaUnit, CanonicalService } from './schema';

/**
 * Structured condition questions (spec §26a.2) — the fields that make a
 * per-acre price meaningful. Tap-to-answer, never free text: free text does
 * not compare across jobs. Answers land in `service_attributes` keyed by
 * question key.
 *
 * Content exists for Paddock topping (spec worked example), Fencing, weed
 * control/spraying, Hedge cutting and Hay, straw & haylage; other
 * services get their sets as Tom supplies them — an empty entry simply renders
 * no questions, so adding a set is config-only.
 */

export type ConditionOption = {
  value: string;
  label: string;
  /** One line under the label. Options with an image render as cards. */
  description?: string;
  image?: string;
};

export type ChoiceQuestion = {
  kind?: 'choice';
  key: string;
  label: string;
  /** How the answer reads on the contractor's job spec ("Height: 6ft"). */
  short?: string;
  hint?: string;
  /** A heading drawn above this question, starting a new group. */
  group?: string;
  options: ConditionOption[];
  /** Several answers allowed, stored comma-joined in option order. */
  multi?: boolean;
  /** With `multi`: the one answer that rules out the rest ("No gates"). */
  exclusive?: string;
  /** Asked only when this holds for the answers so far. */
  showIf?: (answers: Record<string, string>) => boolean;
  /**
   * The contractor cannot price without it. Never a hard block (a disabled
   * Send loses the lead): the first Send without an answer scrolls here and
   * asks; a second Send goes anyway. Give it a "Not sure" option.
   */
  required?: boolean;
};

/**
 * The job's quantity, asked in the flow's own words and at its own place in
 * the sequence. It is not stored as an attribute: it IS area_value/area_unit,
 * the figure contractors price against, so it replaces the generic "How much
 * ground?" field rather than duplicating it.
 */
export type QuantityQuestion = {
  kind: 'quantity';
  key: 'quantity';
  label: string;
  unit: AreaUnit;
  hint?: string;
  group?: string;
};

/**
 * A count the customer types rather than taps — bales of hay — stored as an
 * attribute like any other answer. Unlike `quantity` it is not the job's
 * area_value: twenty bales have no area, and the figure's unit is in its key.
 */
export type NumberQuestion = {
  kind: 'number';
  key: string;
  label: string;
  short?: string;
  hint?: string;
  group?: string;
  /** Whole numbers only (a bale count); the default accepts decimals. */
  integer?: boolean;
  showIf?: (answers: Record<string, string>) => boolean;
  required?: boolean;
};

export type ConditionQuestion = ChoiceQuestion | QuantityQuestion | NumberQuestion;
/** A question whose answer lands in service_attributes (everything but the quantity). */
export type AnsweredQuestion = ChoiceQuestion | NumberQuestion;

const YES_NO: ConditionOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Where the capping rail question makes sense: boarded fences, not open ones. */
const CAPPABLE = new Set(['closeboard', 'closeboard_panels', 'lap_panels']);

export const FENCE_TYPES: ConditionOption[] = [
  {
    value: 'closeboard',
    label: 'Closeboard (featheredge)',
    description: 'Overlapping upright boards fixed to rails on site. The sturdiest solid fence.',
    image: '/images/fencing/closeboard.svg',
  },
  {
    value: 'closeboard_panels',
    label: 'Closeboard panels',
    description: 'The same featheredge look, made up as ready-built panels between posts.',
    image: '/images/fencing/closeboard-panels.svg',
  },
  {
    value: 'lap_panels',
    label: 'Lap panels',
    description: 'Overlapping horizontal boards in a panel. The everyday garden fence.',
    image: '/images/fencing/lap-panels.svg',
  },
  {
    value: 'picket',
    label: 'Picket fencing',
    description: 'Spaced upright pales with pointed tops. Low and decorative.',
    image: '/images/fencing/picket.svg',
  },
  {
    value: 'post_and_rail',
    label: 'Post and rail',
    description: 'Two or three rails between posts, for paddocks, horses and boundaries.',
    image: '/images/fencing/post-and-rail.svg',
  },
  {
    value: 'trellis',
    label: 'Trellis panels',
    description: 'Open lattice panels, on their own or topping a fence, for climbers.',
    image: '/images/fencing/trellis.svg',
  },
];

/**
 * What's growing decides the chemical, the rate and whether it can be done
 * at all near stock — ragwort and bracken are a different job from docks in
 * a paddock. The contractor needs it before they can price, so it is asked
 * of every weed control and spraying job.
 */
const WEED_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'weeds',
    label: 'Which weeds need dealing with?',
    short: 'Weeds',
    hint: 'Pick every one you’ve got.',
    multi: true,
    exclusive: 'not_sure',
    required: true,
    options: [
      { value: 'ragwort', label: 'Ragwort' },
      { value: 'docks', label: 'Docks' },
      { value: 'thistles', label: 'Thistles' },
      { value: 'nettles', label: 'Nettles' },
      { value: 'buttercups', label: 'Buttercups' },
      { value: 'bracken', label: 'Bracken' },
      { value: 'brambles', label: 'Brambles' },
      { value: 'horsetail', label: 'Horsetail' },
      { value: 'other', label: 'Something else' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
];

/**
 * Hedge cutting is priced by the metre, and the metre price turns on how
 * much of the hedge is cut: each side is a pass, the top is another, and a
 * tall hedge needs a longer reach arm. A Devon job went out on 26 Sep as
 * "10 acres" with nothing else — not a figure anyone can price a hedge from.
 */
const HEDGE_QUESTIONS: ConditionQuestion[] = [
  {
    kind: 'quantity',
    key: 'quantity',
    label: 'How many metres of hedge?',
    unit: 'linear_m',
    hint: 'The length of the hedge, measured once even if both sides need cutting. A rough figure is fine. Pace it out if you can.',
  },
  {
    key: 'hedge_height',
    label: 'How tall is it?',
    short: 'Height',
    options: [
      { value: 'under_6ft', label: 'Up to 6ft' },
      { value: '6_10ft', label: '6–10ft' },
      { value: 'over_10ft', label: 'Over 10ft' },
    ],
  },
  {
    key: 'hedge_sides',
    label: 'Which parts need cutting?',
    short: 'Cutting',
    hint: 'Pick every one you want done.',
    multi: true,
    exclusive: 'not_sure',
    required: true,
    options: [
      { value: 'my_side', label: 'My side' },
      { value: 'far_side', label: 'The far side (road or neighbour)' },
      { value: 'top', label: 'The top' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
];

/**
 * Hay, straw and haylage are priced by the bale, and the bale price turns on
 * what the bale is: a conventional small bale and a Heston are a different
 * load, a different trailer and a different price. Every hay job to date (9,
 * to 9 Oct 2026) went out as the customer's words alone — "25 small square
 * bales, or 1 big round bale", "2 square bales of hay 2 of straw every 2
 * weeks" — with no count, size or frequency a supplier could price from
 * without ringing round. A regular order is a different proposition from a
 * one-off, so it is asked, and how often.
 */
const HAY_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'forage',
    label: 'What do you need?',
    short: 'Forage',
    hint: 'Pick every one you need.',
    multi: true,
    required: true,
    options: [
      { value: 'hay', label: 'Hay' },
      { value: 'straw', label: 'Straw' },
      { value: 'haylage', label: 'Haylage' },
    ],
  },
  {
    kind: 'number',
    key: 'bale_count',
    label: 'How many bales?',
    short: 'Bales',
    hint: 'A rough figure is fine. For a regular order, how many each time.',
    integer: true,
    required: true,
  },
  {
    key: 'bale_size',
    label: 'What size of bale?',
    short: 'Bale size',
    required: true,
    options: [
      { value: 'small', label: 'Small (conventional)' },
      { value: 'round', label: 'Round' },
      { value: 'large_square', label: 'Large square (Heston)' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'delivery',
    label: 'Delivered, or will you collect?',
    short: 'Delivery',
    options: [
      { value: 'delivered', label: 'Delivered' },
      { value: 'collect', label: 'I can collect' },
      { value: 'either', label: 'Either' },
    ],
  },
  {
    key: 'order',
    label: 'Is this a one-off, or a regular order?',
    short: 'Order',
    required: true,
    options: [
      { value: 'one_off', label: 'One-off' },
      { value: 'regular', label: 'Regular order' },
    ],
  },
  {
    key: 'frequency',
    label: 'How often?',
    short: 'How often',
    showIf: (a) => a.order === 'regular',
    options: [
      { value: 'weekly', label: 'Every week' },
      { value: 'fortnightly', label: 'Every 2 weeks' },
      { value: 'monthly', label: 'Every month' },
      { value: 'quarterly', label: 'Every few months' },
      { value: 'not_sure', label: 'Not sure yet' },
    ],
  },
];

/**
 * Stump grinding is priced per stump, and the price per stump turns on size:
 * a 20cm sapling stump is minutes, a metre-wide oak is most of a morning.
 * Access decides the machine (a pedestrian grinder fits through a garden
 * gate, a tracked one wants a field gateway), and whether the grindings
 * stay or go is a separate cost the contractor would otherwise have to ask.
 */
const STUMP_QUESTIONS: ConditionQuestion[] = [
  {
    kind: 'number',
    key: 'stump_count',
    label: 'How many stumps?',
    short: 'Stumps',
    hint: 'A rough count is fine.',
    integer: true,
    required: true,
  },
  {
    key: 'stump_size',
    label: 'How wide is the biggest stump?',
    short: 'Biggest stump',
    hint: 'Across the top, roughly.',
    required: true,
    options: [
      { value: 'under_30cm', label: 'Under 30cm (a foot)' },
      { value: '30_60cm', label: '30–60cm' },
      { value: 'over_60cm', label: 'Over 60cm' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'stump_access',
    label: 'How does a machine get to them?',
    short: 'Access',
    required: true,
    options: [
      { value: 'vehicle', label: 'A vehicle can drive right up' },
      { value: 'gate', label: 'Through a garden gate or narrow gap' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'grindings',
    label: 'What should happen to the grindings?',
    short: 'Grindings',
    options: [
      { value: 'leave', label: 'Leave them in the hole' },
      { value: 'remove', label: 'Take them away' },
      { value: 'either', label: 'Either' },
    ],
  },
];

/**
 * Log splitting is priced on the pile: how much timber, and whether it is
 * already cut to ring length (a splitter) or still in trunk lengths (a
 * processor, or a saw first). A splitter runs off a tractor or its own
 * engine, so access for one is asked.
 */
const LOG_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'timber_amount',
    label: 'Roughly how much timber is there?',
    short: 'Timber',
    required: true,
    options: [
      { value: 'trailer', label: 'A trailer load or less' },
      { value: 'few_loads', label: 'A few trailer loads' },
      { value: 'large', label: 'A big stack or several trees' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'timber_state',
    label: 'What state is it in?',
    short: 'State',
    required: true,
    options: [
      { value: 'rings', label: 'Cut into rings, ready to split' },
      { value: 'lengths', label: 'Trunk or branch lengths, not cut' },
      { value: 'mixed', label: 'A mix' },
    ],
  },
  {
    key: 'timber_access',
    label: 'Can a tractor or vehicle get to the pile?',
    short: 'Access',
    required: true,
    options: [
      { value: 'yes', label: 'Yes, right up to it' },
      { value: 'near', label: 'Close, but not right up to it' },
      { value: 'no', label: 'No, it would have to be carried' },
    ],
  },
  {
    key: 'stacking',
    label: 'Do you want the logs stacked?',
    short: 'Stacking',
    options: [
      { value: 'stack', label: 'Yes, stacked where I say' },
      { value: 'pile', label: 'No, a pile is fine' },
    ],
  },
];

/**
 * Muck spreading is priced on the acreage, but the job turns on the heap:
 * whether there is one at all (or the muck has to be bought in), how big it
 * is (loads, and so hours), and whether a loader is needed to fill the
 * spreader. Rotted muck spreads evenly; fresh bedding lumps and clogs.
 * Supplied muck is priced by the load, so that case asks how many.
 */
const MUCK_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'muck_source',
    label: 'Where is the muck coming from?',
    short: 'Muck',
    required: true,
    options: [
      { value: 'heap', label: 'A heap here on site' },
      { value: 'supply', label: 'I need it supplied as well' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'heap_size',
    label: 'Roughly how big is the heap?',
    short: 'Heap',
    hint: 'A rough guess is fine. A trailer load is about 8 tonnes.',
    required: true,
    showIf: (a) => a.muck_source === 'heap',
    options: [
      { value: 'small', label: 'A couple of trailer loads or less' },
      { value: 'medium', label: 'A few loads (about 3 to 10)' },
      { value: 'large', label: 'More than 10 loads' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'supply_loads',
    label: 'Roughly how much muck do you need?',
    short: 'Supply',
    hint: 'A trailer load is about 8 tonnes. The contractor can advise on a rate per acre.',
    required: true,
    showIf: (a) => a.muck_source === 'supply',
    options: [
      { value: 'small', label: 'A couple of trailer loads or less' },
      { value: 'medium', label: 'A few loads (about 3 to 10)' },
      { value: 'large', label: 'More than 10 loads' },
      { value: 'not_sure', label: 'Not sure, advise me' },
    ],
  },
  {
    key: 'muck_type',
    label: 'What kind of muck is it?',
    short: 'Type',
    showIf: (a) => a.muck_source === 'heap',
    options: [
      { value: 'rotted', label: 'Well rotted' },
      { value: 'fresh', label: 'Fresh, with straw or shavings' },
      { value: 'mixed', label: 'A mix' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
];

/**
 * Muck heap removal is priced by the job: how many loads (the heap's size),
 * whether the contractor has to bring a loader, and how far a lorry or
 * tractor and trailer can get to it. Where it goes decides the tipping cost.
 */
const MUCK_REMOVAL_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'heap_size',
    label: 'Roughly how big is the heap?',
    short: 'Heap',
    hint: 'A rough guess is fine. A trailer load is about 8 tonnes.',
    required: true,
    options: [
      { value: 'small', label: 'A couple of trailer loads or less' },
      { value: 'medium', label: 'A few loads (about 3 to 10)' },
      { value: 'large', label: 'More than 10 loads' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'heap_access',
    label: 'Can a tractor and trailer get right up to it?',
    short: 'Access',
    required: true,
    options: [
      { value: 'yes', label: 'Yes, right up to it' },
      { value: 'near', label: 'Close, but not right up to it' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'heap_destination',
    label: 'Where should the muck go?',
    short: 'Goes to',
    options: [
      { value: 'off_site', label: 'Taken away off site' },
      { value: 'on_site', label: 'Moved somewhere else on my land' },
      { value: 'either', label: 'Whatever is easiest' },
    ],
  },
];

/**
 * Paddock sweeping is priced on the area, but the time on site turns on what
 * has fallen and where: a tree line along one fence is a fraction of a whole
 * field under oaks, and the hopper empties more often in a heavy mast year.
 * Where the sweepings go matters because acorns and sycamore seeds must not
 * end up anywhere a horse can reach them.
 */
const SWEEP_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'sweep_what',
    label: 'What needs sweeping up?',
    short: 'Sweeping',
    hint: 'Tick all that apply.',
    required: true,
    multi: true,
    options: [
      { value: 'acorns', label: 'Acorns' },
      { value: 'sycamore', label: 'Sycamore seeds' },
      { value: 'leaves', label: 'Leaves' },
      { value: 'droppings', label: 'Droppings as well' },
      { value: 'not_sure', label: 'Not sure' },
    ],
    exclusive: 'not_sure',
  },
  {
    key: 'sweep_extent',
    label: 'How much of the paddock needs doing?',
    short: 'Area',
    required: true,
    options: [
      { value: 'tree_line', label: 'Just under and around the trees' },
      { value: 'most', label: 'Most of the paddock' },
      { value: 'whole', label: 'The whole paddock' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'tree_count',
    label: 'How many trees drop into the paddock?',
    short: 'Trees',
    options: [
      { value: '1_3', label: 'One to three' },
      { value: '4_10', label: 'Four to ten' },
      { value: 'more', label: 'More than ten, or a whole tree line' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'sweepings_destination',
    label: 'Where should the sweepings go?',
    short: 'Goes to',
    options: [
      { value: 'on_site', label: 'A pile here, out of the horses’ reach' },
      { value: 'off_site', label: 'Taken away' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'visits',
    label: 'One visit or several?',
    short: 'Visits',
    options: [
      { value: 'one_off', label: 'A one-off sweep' },
      { value: 'regular', label: 'Regular visits through the autumn' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
];

/**
 * What is under the line is most of the difference between two trenches of the
 * same length: grass digs fast, a concrete yard has to be broken out first,
 * and rock or old foundations can stop a mini digger altogether.
 */
const DIG_SURFACE: ChoiceQuestion = {
  key: 'surface',
  label: 'What is the ground along the line?',
  short: 'Ground',
  hint: 'Tick all that apply.',
  multi: true,
  exclusive: 'not_sure',
  options: [
    { value: 'grass', label: 'Grass or field' },
    { value: 'hard', label: 'Concrete, tarmac or a stone yard' },
    { value: 'rocky', label: 'Rocky or full of stones' },
    { value: 'not_sure', label: 'Not sure' },
  ],
};

/** Where the dug soil goes: spread here, or loaded and taken away. */
const SPOIL: ChoiceQuestion = {
  key: 'spoil',
  label: 'What should happen to any spare soil?',
  short: 'Spoil',
  options: [
    { value: 'on_site', label: 'Leave it or spread it here' },
    { value: 'off_site', label: 'Take it away' },
    { value: 'not_sure', label: 'Not sure' },
  ],
};

/**
 * Pipe laying is priced by the metre, and the metre turns on what the pipe is
 * for (a trough supply goes in narrow and shallow, a land drain wants a fall
 * and gravel), whether the trench is part of the job, and who buys the pipe.
 */
const PIPE_QUESTIONS: ConditionQuestion[] = [
  {
    kind: 'quantity',
    key: 'quantity',
    label: 'How many metres of pipe?',
    unit: 'linear_m',
    hint: 'The length of the run from end to end. A rough figure is fine. Pace it out if you can.',
  },
  {
    key: 'pipe_for',
    label: 'What is the pipe for?',
    short: 'Pipe for',
    required: true,
    options: [
      { value: 'water', label: 'Water supply to troughs or buildings' },
      { value: 'drainage', label: 'Land drainage' },
      { value: 'duct', label: 'A duct for a cable' },
      { value: 'waste', label: 'Waste water or a septic tank' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'pipe_supply',
    label: 'Who supplies the pipe?',
    short: 'Pipe supplied by',
    options: [
      { value: 'contractor', label: 'The contractor' },
      { value: 'me', label: 'I have it already' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'trench_needed',
    label: 'Does the trench need digging too?',
    short: 'Trench',
    options: [
      { value: 'yes', label: 'Yes, dig it and fill it back in' },
      { value: 'dug', label: 'No, it is already dug' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  DIG_SURFACE,
];

/**
 * Trenching is priced by the metre. Depth sets the machine and how much
 * support the sides need; what it is for says how neat the bottom has to be;
 * backfilling is a second pass that not every customer wants.
 */
const TRENCH_QUESTIONS: ConditionQuestion[] = [
  {
    kind: 'quantity',
    key: 'quantity',
    label: 'How many metres of trench?',
    unit: 'linear_m',
    hint: 'The length from end to end. A rough figure is fine. Pace it out if you can.',
  },
  {
    key: 'trench_for',
    label: 'What is the trench for?',
    short: 'Trench for',
    required: true,
    options: [
      { value: 'pipe', label: 'A water or drainage pipe' },
      { value: 'cable', label: 'An electric cable or duct' },
      { value: 'footings', label: 'Footings or a foundation' },
      { value: 'drainage', label: 'An open drain' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'trench_depth',
    label: 'How deep?',
    short: 'Depth',
    options: [
      { value: 'under_600', label: 'Up to 2ft (600mm)' },
      { value: '600_1m', label: '2–3ft (600mm–1m)' },
      { value: 'over_1m', label: 'Deeper than 3ft (1m)' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'backfill',
    label: 'Should it be filled back in?',
    short: 'Backfill',
    options: [
      { value: 'yes', label: 'Yes, once the pipe or cable is in' },
      { value: 'no', label: 'No, leave it open' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  DIG_SURFACE,
  SPOIL,
];

/**
 * Mini digger work is by the hour or day, so the price is the time: what the
 * digging is and roughly how long. The gate width decides whether a mini or
 * only a micro digger can get in, and that is the first thing they ask.
 */
const MINI_DIGGER_QUESTIONS: ConditionQuestion[] = [
  {
    key: 'digger_for',
    label: 'What is the digger for?',
    short: 'Work',
    hint: 'Tick all that apply.',
    required: true,
    multi: true,
    exclusive: 'not_sure',
    options: [
      { value: 'trenches', label: 'Trenches' },
      { value: 'footings', label: 'Footings or a base' },
      { value: 'levelling', label: 'Levelling or landscaping' },
      { value: 'stumps', label: 'Stumps or roots' },
      { value: 'pond', label: 'A small pond' },
      { value: 'not_sure', label: 'Something else or not sure' },
    ],
  },
  {
    key: 'duration',
    label: 'Roughly how long do you think it will take?',
    short: 'Time',
    options: [
      { value: 'half_day', label: 'Half a day' },
      { value: 'day', label: 'A day' },
      { value: '2_3_days', label: 'Two or three days' },
      { value: 'longer', label: 'Longer' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'access_width',
    label: 'How wide is the narrowest way in?',
    short: 'Access',
    hint: 'A gate, a path or a gap between buildings.',
    options: [
      { value: 'under_1m', label: 'Under 1m (3ft)' },
      { value: '1_1_5m', label: '1–1.5m (3–5ft)' },
      { value: 'wider', label: 'Wider than that' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  SPOIL,
];

export const CONDITION_QUESTIONS: Partial<Record<CanonicalService, ConditionQuestion[]>> = {
  'Weed control': WEED_QUESTIONS,
  Spraying: WEED_QUESTIONS,
  'Hedge cutting': HEDGE_QUESTIONS,
  'Hay, straw & haylage': HAY_QUESTIONS,
  'Stump grinding': STUMP_QUESTIONS,
  'Mobile log splitting': LOG_QUESTIONS,
  'Muck spreading': MUCK_QUESTIONS,
  'Muck heap removal': MUCK_REMOVAL_QUESTIONS,
  'Paddock sweeping': SWEEP_QUESTIONS,
  'Pipe laying': PIPE_QUESTIONS,
  Trenching: TRENCH_QUESTIONS,
  'Mini digger work': MINI_DIGGER_QUESTIONS,
  'Paddock topping': [
    {
      key: 'last_cut',
      short: 'Last cut',
      label: 'When was the grass last cut?',
      // How long it has been decides the machine and the time on site — a
      // topper for this year's growth, a flail for three years of it.
      required: true,
      options: [
        { value: 'this_year', label: 'This year' },
        { value: '1_2_years', label: '1–2 years ago' },
        { value: 'longer', label: 'Longer' },
        { value: 'never', label: 'Never / not sure' },
      ],
    },
    {
      key: 'growing',
      short: 'Growing',
      label: 'What’s growing?',
      options: [
        { value: 'grass', label: 'Mostly grass' },
        { value: 'nettles_thistles', label: 'Nettles & thistles' },
        { value: 'scrub_brambles', label: 'Scrub & brambles' },
      ],
    },
    {
      key: 'ground',
      short: 'Ground',
      label: 'How’s the ground?',
      options: [
        { value: 'dry', label: 'Dry' },
        { value: 'soft', label: 'Soft in places' },
        { value: 'wet', label: 'Wet' },
      ],
    },
  ],
  // Fencing is priced by the metre, and the metre price turns on exactly
  // these: the style sets the materials, height and posts set the cost of
  // each bay, gates are priced separately, and slope, clearing and an old
  // fence to take out are the labour a flat run doesn't have.
  Fencing: [
    {
      key: 'fence_type',
      label: 'What type of fencing?',
      short: 'Fence type',
      group: 'Your fencing',
      options: FENCE_TYPES,
    },
    {
      key: 'height',
      label: 'How tall?',
      short: 'Height',
      options: [
        { value: '3ft', label: '3ft' },
        { value: '4ft', label: '4ft' },
        { value: '5ft', label: '5ft' },
        { value: '6ft', label: '6ft' },
      ],
    },
    {
      kind: 'quantity',
      key: 'quantity',
      label: 'How many metres?',
      unit: 'linear_m',
      hint: 'The total length of fence. A rough figure is fine. Pace it out if you can.',
    },
    {
      key: 'posts',
      label: 'Posts',
      short: 'Posts',
      options: [
        { value: 'wooden', label: 'Wooden' },
        { value: 'concrete', label: 'Concrete' },
      ],
    },
    {
      key: 'capping',
      label: 'Capping rail?',
      short: 'Capping rail',
      hint: 'A timber strip along the top that sheds rain off the boards.',
      options: YES_NO,
      showIf: (a) => !a.fence_type || CAPPABLE.has(a.fence_type),
    },
    {
      key: 'gates',
      label: 'Any gates, and what size?',
      short: 'Gates',
      hint: 'Pick every size you need.',
      multi: true,
      exclusive: 'none',
      options: [
        { value: 'none', label: 'No gates' },
        { value: 'pedestrian', label: 'Pedestrian (about 3–4ft)' },
        { value: 'driveway', label: 'Driveway (about 8–10ft)' },
        { value: 'field', label: 'Field gate (about 12ft)' },
      ],
    },
    {
      key: 'slope',
      label: 'Is it on a slope?',
      short: 'On a slope',
      group: 'A few details',
      options: YES_NO,
    },
    {
      key: 'clearance',
      label: 'Does the line need clearing first?',
      short: 'Line needs clearing',
      hint: 'Brambles, hedge or scrub along where the fence will go.',
      options: YES_NO,
    },
    {
      key: 'old_fence',
      label: 'Is there an old fence to remove?',
      short: 'Old fence to remove',
      options: YES_NO,
    },
  ],
};

export function conditionsFor(service: string | null): ConditionQuestion[] {
  if (!service) return [];
  return CONDITION_QUESTIONS[service as CanonicalService] ?? [];
}

/** The service's own quantity question, when its flow asks one. */
export function quantityFor(service: string | null): QuantityQuestion | null {
  return (
    conditionsFor(service).find((q): q is QuantityQuestion => q.kind === 'quantity') ?? null
  );
}

/** Answered questions (choices and counts) still asked, given the answers so far. */
export function visibleChoices(
  service: string | null,
  answers: Record<string, string>,
): AnsweredQuestion[] {
  return conditionsFor(service).filter(
    (q): q is AnsweredQuestion => q.kind !== 'quantity' && (!q.showIf || q.showIf(answers)),
  );
}

/**
 * Services priced by ground area — where boundary drawing is required
 * (spec §7/§26a.1). Supply and hire aren't priced off an acreage; an
 * unmatched/null service can't be either. Lives here rather than schema.ts so
 * client components can import it without pulling zod into the bundle.
 */
const NON_AREA_PRICED: ReadonlySet<string> = new Set([
  'Hay, straw & haylage',
  'Tractor hire (events)',
  // Linear work: per-metre, no field boundary to draw.
  'Hedge cutting',
  'Ditch clearance',
  'Fencing',
  'Road grading',
  'Road construction/repair',
  // Machinery and driver, priced by the hour, day or load.
  'General tractor work',
  'Trailer work',
  'Excavator work',
  'Mini digger work',
  // Pipe and trench work: per metre, no field boundary to draw.
  'Pipe laying',
  'Trenching',
  // Priced by the job, not the acre.
  'Tree felling & chipping',
  // A count of stumps and a pile of timber: no field to draw.
  'Stump grinding',
  'Mobile log splitting',
  // A heap is loads, not acres.
  'Muck heap removal',
]);

export function isAreaPriced(service: string | null): boolean {
  return service !== null && !NON_AREA_PRICED.has(service);
}

/** Next answer for a multi-select tap: toggles, honouring the exclusive option. */
export function toggleMulti(q: ChoiceQuestion, current: string | undefined, value: string): string {
  const on = new Set((current ?? '').split(',').filter(Boolean));
  if (on.has(value)) {
    on.delete(value);
  } else {
    if (value === q.exclusive) on.clear();
    else if (q.exclusive) on.delete(q.exclusive);
    on.add(value);
  }
  return q.options
    .map((o) => o.value)
    .filter((v) => on.has(v))
    .join(',');
}

/** A stored answer checked against the question: null when it isn't valid. */
function validAnswer(q: AnsweredQuestion, raw: string): string | null {
  if (q.kind === 'number') {
    const typed = Number(raw.trim().replace(/,/g, ''));
    // Round first: 0.3 of a bale is no bales, not "0" stored as an answer.
    const n = q.integer ? Math.round(typed) : typed;
    if (!Number.isFinite(n) || n <= 0) return null;
    return String(n);
  }
  const allowed = new Set(q.options.map((o) => o.value));
  if (!q.multi) return allowed.has(raw) ? raw : null;
  const picked = raw.split(',').filter((v) => allowed.has(v));
  if (picked.length === 0) return null;
  if (q.exclusive && picked.includes(q.exclusive) && picked.length > 1) return null;
  return q.options
    .map((o) => o.value)
    .filter((v) => picked.includes(v))
    .join(',');
}

/**
 * Whether a stored or typed value counts as an answer to the question — the
 * same test the server applies, so a "0" in the bales box is asked about
 * rather than sent and silently dropped.
 */
export function hasAnswer(q: AnsweredQuestion, raw: string | undefined): boolean {
  return typeof raw === 'string' && validAnswer(q, raw) !== null;
}

/**
 * Every required question still showing has a valid answer. What the portal
 * form's auto-conversion treats as "the answers already are the job".
 */
export function requiredAnswered(service: string | null, answers: Record<string, string>): boolean {
  const asked = visibleChoices(service, answers).filter((q) => q.required);
  return asked.length > 0 && asked.every((q) => hasAnswer(q, answers[q.key]));
}

/**
 * Pull condition answers for a service out of submitted form data
 * (`condition_<key>` fields), validated against the configured options (a
 * count must be a positive number). An answer to a question its earlier
 * answers hide (a capping rail on post and rail, how often for a one-off) is
 * dropped, as it would be on screen.
 */
export function conditionAnswers(
  service: string | null,
  get: (name: string) => unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of conditionsFor(service)) {
    if (q.kind === 'quantity') continue;
    if (q.showIf && !q.showIf(out)) continue;
    const raw = get(`condition_${q.key}`);
    if (typeof raw !== 'string') continue;
    const answer = validAnswer(q, raw);
    if (answer !== null) out[q.key] = answer;
  }
  return out;
}

/**
 * Stored answers as readable rows for a job spec — "Height: 6ft", not
 * "height: 6ft". Keys this service's flow doesn't know (a set that has since
 * changed, or no set at all) come back raw rather than vanishing.
 */
export function describeConditions(
  service: string | null,
  answers: Record<string, unknown>,
): [string, string][] {
  const known = new Map(
    conditionsFor(service)
      .filter((q): q is AnsweredQuestion => q.kind !== 'quantity')
      .map((q) => [q.key, q]),
  );
  // In the order the questions were asked, not the order they were stored:
  // jsonb sorts its keys by length, which put "Fence type" last.
  const order = [...known.keys()];
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const entries = Object.entries(answers).sort(([a], [b]) => rank(a) - rank(b));
  const rows: [string, string][] = [];
  for (const [key, value] of entries) {
    const raw = String(value);
    const q = known.get(key);
    if (!q) {
      rows.push([key.replace(/_/g, ' '), raw.replace(/_/g, ' ')]);
      continue;
    }
    if (q.kind === 'number') {
      rows.push([q.short ?? q.label, raw]);
      continue;
    }
    const labels = raw
      .split(',')
      .map((v) => q.options.find((o) => o.value === v)?.label ?? v.replace(/_/g, ' '));
    rows.push([q.short ?? q.label, labels.join(', ')]);
  }
  return rows;
}
