// The list lives on its own, free of zod, so client components (the confirm
// step's job picker) can import it without pulling the validator into the
// bundle. schema.ts re-exports it; nothing else needs to change its import.

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
  'Land clearance',
  'Ditch clearance',
  'Weed control',
  'Spraying',
  'Fertiliser application',
  'Overseeding',
  'Manure sweeping',
  'Hay, straw & haylage',
  'Tractor hire (events)',
  'Hedge cutting',
  'Fencing',
  'General tractor work',
  'Trailer work',
  'Road grading',
  'Fixed tooth mulching',
  'Excavator work',
  'Road construction/repair',
  'Mounding',
  'Lime spreading',
  'Tree felling & chipping',
  'Sub-soiling',
  'Scarifying',
] as const;

export type CanonicalService = (typeof CANONICAL_SERVICES)[number];
