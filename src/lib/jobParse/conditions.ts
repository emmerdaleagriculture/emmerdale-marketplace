import type { AreaUnit, CanonicalService } from './schema';

/**
 * Structured condition questions (spec §26a.2) — the fields that make a
 * per-acre price meaningful. Tap-to-answer, never free text: free text does
 * not compare across jobs. Answers land in `service_attributes` keyed by
 * question key.
 *
 * Content exists for Paddock topping (spec worked example) and Fencing; other
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

export type ConditionQuestion = ChoiceQuestion | QuantityQuestion;

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

export const CONDITION_QUESTIONS: Partial<Record<CanonicalService, ConditionQuestion[]>> = {
  'Weed control': WEED_QUESTIONS,
  Spraying: WEED_QUESTIONS,
  'Paddock topping': [
    {
      key: 'last_cut',
      short: 'Last cut',
      label: 'When was it last cut?',
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
      hint: 'The total length of fence. A rough figure is fine — pace it out if you can.',
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

/** Choice questions still asked, given the answers so far. */
export function visibleChoices(
  service: string | null,
  answers: Record<string, string>,
): ChoiceQuestion[] {
  return conditionsFor(service).filter(
    (q): q is ChoiceQuestion => q.kind !== 'quantity' && (!q.showIf || q.showIf(answers)),
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
function validAnswer(q: ChoiceQuestion, raw: string): string | null {
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
 * Pull condition answers for a service out of submitted form data
 * (`condition_<key>` fields), validated against the configured options. An
 * answer to a question its earlier answers hide (a capping rail on post and
 * rail) is dropped, as it would be on screen.
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
      .filter((q): q is ChoiceQuestion => q.kind !== 'quantity')
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
    const labels = raw
      .split(',')
      .map((v) => q.options.find((o) => o.value === v)?.label ?? v.replace(/_/g, ' '));
    rows.push([q.short ?? q.label, labels.join(', ')]);
  }
  return rows;
}
