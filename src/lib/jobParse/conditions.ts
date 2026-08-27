import type { CanonicalService } from './schema';

/**
 * Structured condition questions (spec §26a.2) — the fields that make a
 * per-acre price meaningful. Tap-to-answer, never free text: free text does
 * not compare across jobs. Answers land in `service_attributes` keyed by
 * question key.
 *
 * Content exists for Paddock topping (spec worked example); other services
 * get their sets as Tom supplies them — an empty entry simply renders no
 * questions, so adding a set is config-only.
 */

export type ConditionQuestion = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export const CONDITION_QUESTIONS: Partial<Record<CanonicalService, ConditionQuestion[]>> = {
  'Paddock topping': [
    {
      key: 'last_cut',
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
      label: 'What’s growing?',
      options: [
        { value: 'grass', label: 'Mostly grass' },
        { value: 'nettles_thistles', label: 'Nettles & thistles' },
        { value: 'scrub_brambles', label: 'Scrub & brambles' },
      ],
    },
    {
      key: 'ground',
      label: 'How’s the ground?',
      options: [
        { value: 'dry', label: 'Dry' },
        { value: 'soft', label: 'Soft in places' },
        { value: 'wet', label: 'Wet' },
      ],
    },
  ],
};

export function conditionsFor(service: string | null): ConditionQuestion[] {
  if (!service) return [];
  return CONDITION_QUESTIONS[service as CanonicalService] ?? [];
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
  'Hedge cutting', // linear work: per-metre, no field boundary to draw
]);

export function isAreaPriced(service: string | null): boolean {
  return service !== null && !NON_AREA_PRICED.has(service);
}

/**
 * Pull condition answers for a service out of submitted form data
 * (`condition_<key>` fields), validated against the configured options.
 */
export function conditionAnswers(
  service: string | null,
  get: (name: string) => unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of conditionsFor(service)) {
    const raw = get(`condition_${q.key}`);
    if (typeof raw !== 'string') continue;
    if (q.options.some((o) => o.value === raw)) out[q.key] = raw;
  }
  return out;
}
