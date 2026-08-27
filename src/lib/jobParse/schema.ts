import { z } from 'zod';

/**
 * Canonical service taxonomy — the LLM's entire output space for `service`.
 * Names must match `services.name` in the database exactly (seed.sql plus the
 * hay and tractor-hire additions): the confirm action resolves name → id at
 * write time, so a drifted spelling silently becomes unmatched. A unit test
 * asserts this list and the tool JSON schema enum stay identical.
 *
 * Unconstrained in, canonical out: customer text is never pre-filtered; only
 * the stored value is constrained (spec §5.3).
 */
export const CANONICAL_SERVICES = [
  'Paddock topping',
  'Flailing',
  'Flail collecting',
  'Finish mowing',
  'Harrowing',
  'Rolling',
  'Rotavating',
  'Mole ploughing',
  'Stone burying',
  'Land & ditch clearance',
  'Weed control',
  'Spraying',
  'Fertiliser application',
  'Overseeding',
  'Manure sweeping',
  'Hay, straw & haylage',
  'Tractor hire (events)',
] as const;

export type CanonicalService = (typeof CANONICAL_SERVICES)[number];

/** `unmatched` is a first-class output, not a failure (spec §6.2). */
export const LLM_SERVICE_VALUES = [...CANONICAL_SERVICES, 'unmatched'] as const;

export const AREA_UNITS = ['acres', 'hectares', 'sq_m', 'linear_m'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const URGENCY_VALUES = ['asap', 'within_month', 'flexible', 'dated'] as const;
export type Urgency = (typeof URGENCY_VALUES)[number];

/**
 * Validated shape of the model's tool call. Validated on receipt even though
 * the tool is strict — a violation is a prompt/schema bug to log, never a
 * value to store (spec §6.2).
 */
export const LlmParseSchema = z.object({
  service: z.enum(LLM_SERVICE_VALUES),
  service_verbatim: z.string(),
  service_confidence: z.number().min(0).max(1),
  service_alternatives: z.array(z.enum(CANONICAL_SERVICES)).max(3),
  area: z
    .object({ value: z.number(), unit: z.enum(AREA_UNITS) })
    .nullable(),
  urgency: z.enum(URGENCY_VALUES).nullable(),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  access_notes: z.string().nullable(),
  obstacles: z.string().nullable(),
  // Strict schemas forbid free-form objects (additionalProperties: false), so
  // per-service attributes travel as name/value pairs and are folded into
  // jsonb server-side.
  attributes: z.array(z.object({ name: z.string(), value: z.string() })),
  field_confidence: z.object({
    area: z.number().min(0).max(1),
    urgency: z.number().min(0).max(1),
    location: z.number().min(0).max(1),
  }),
});

export type LlmParse = z.infer<typeof LlmParseSchema>;

/**
 * The strict tool schema handed to the API. Hand-written rather than derived
 * so the exact wire shape is auditable; kept in this file next to the Zod
 * schema so the two can't drift unnoticed (see schema.test.ts).
 */
export const RECORD_JOB_PARSE_TOOL = {
  name: 'record_job_parse',
  description:
    'Record the structured interpretation of a customer’s free-text description of land/agricultural work. Always call this tool exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'service',
      'service_verbatim',
      'service_confidence',
      'service_alternatives',
      'area',
      'urgency',
      'target_date',
      'access_notes',
      'obstacles',
      'attributes',
      'field_confidence',
    ],
    properties: {
      service: {
        type: 'string',
        enum: [...LLM_SERVICE_VALUES],
        description:
          'The canonical service, or "unmatched" when nothing fits well. Prefer "unmatched" over a poor fit.',
      },
      service_verbatim: {
        type: 'string',
        description:
          'The customer’s own words for the work, copied unaltered from their text.',
      },
      service_confidence: {
        type: 'number',
        description: 'Confidence in the service classification, 0 to 1.',
      },
      service_alternatives: {
        type: 'array',
        items: { type: 'string', enum: [...CANONICAL_SERVICES] },
        description:
          'Up to 3 next-best canonical services, best first. Empty when nothing else is plausible.',
      },
      area: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['value', 'unit'],
        properties: {
          value: { type: 'number' },
          unit: { type: 'string', enum: [...AREA_UNITS] },
        },
        description:
          'The quantity of work as stated by the customer, or null if none given. Use linear_m for hedges/ditches measured by length.',
      },
      urgency: {
        // The API rejects `enum` alongside a ['string','null'] union type —
        // nullable enums must be expressed as anyOf (verified live).
        anyOf: [{ type: 'string', enum: [...URGENCY_VALUES] }, { type: 'null' }],
        description:
          'asap = urgent wording; within_month; flexible = no time pressure stated; dated = a specific date or deadline is given. Null when timing is not mentioned.',
      },
      target_date: {
        type: ['string', 'null'],
        description: 'ISO date (YYYY-MM-DD) when a specific date or deadline is stated, else null.',
      },
      access_notes: {
        type: ['string', 'null'],
        description: 'Anything about getting machinery to/onto the land (gates, narrow lanes, bridges), else null.',
      },
      obstacles: {
        type: ['string', 'null'],
        description: 'In-field obstacles (trees, fences, wet ground, livestock, rubbish), else null.',
      },
      attributes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'value'],
          properties: {
            name: { type: 'string' },
            value: { type: 'string' },
          },
        },
        description:
          'Service-specific details as name/value pairs, e.g. vegetation height for topping, bale type for hay. Empty array if none.',
      },
      field_confidence: {
        type: 'object',
        additionalProperties: false,
        required: ['area', 'urgency', 'location'],
        properties: {
          area: { type: 'number' },
          urgency: { type: 'number' },
          location: { type: 'number' },
        },
        description: 'Per-field extraction confidence, 0 to 1 (0 when the field is absent).',
      },
    },
  },
} as const;

/** What the deterministic layer recovers on its own (always runs; the §6.4 safety net). */
export type DeterministicResult = {
  postcode_full: string | null;
  postcode_outcode: string | null;
  quantities: { value: number; unit: AreaUnit | 'tonnes'; raw: string }[];
  area: { value: number; unit: AreaUnit } | null;
  urgency: Urgency | null;
  target_date: string | null;
  phone: string | null;
  email: string | null;
};

/** The merged, reconciled parse the confirm step renders and edits. */
export type ParseResult = {
  submission_id: string;
  parse_source: 'llm' | 'deterministic_fallback';
  service: CanonicalService | null; // null ⇔ unmatched
  service_verbatim: string;
  service_alternatives: CanonicalService[];
  area_value: number | null;
  area_unit: AreaUnit | null;
  postcode: string | null;
  county_name: string | null;
  lat: number | null;
  lng: number | null;
  urgency: Urgency | null;
  target_date: string | null;
  access_notes: string;
  obstacles: string;
  service_attributes: Record<string, string>;
  parse_confidence: Record<string, number>;
  missing_fields: string[];
};
