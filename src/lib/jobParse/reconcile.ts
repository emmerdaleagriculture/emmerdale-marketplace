import type { CountyResolution } from '@/lib/postcodes';
import { toAcres } from './deterministic';
import type {
  AreaUnit,
  CanonicalService,
  DeterministicResult,
  LlmParse,
  ParseResult,
} from './schema';

/**
 * Reconciliation and normalisation (spec §6.3). Where the two layers
 * disagree:
 *   - deterministic wins on postcodes and numeric values — language models
 *     transpose digits, regexes don't. Not a close call.
 *   - the LLM wins on classification and free-text fields.
 * County, lat and lng come exclusively from the geocode, never from the model.
 */

export type Reconciled = Omit<ParseResult, 'submission_id' | 'parse_source'> & {
  parse_source: 'llm' | 'deterministic_fallback';
  county_id: number | null;
  /** Populated only when no county resolved — what to offer the customer. */
  county_candidates: { id: number; name: string }[];
  county_choice_reason: 'border' | 'unplaced' | null;
  lat: number | null;
  lng: number | null;
  town: string | null;
};

/** Canonical area store: acres for areas, linear metres for lengths. */
function normaliseArea(
  area: { value: number; unit: AreaUnit } | null,
): { value: number; unit: AreaUnit } | null {
  if (!area) return null;
  if (area.unit === 'linear_m') return area;
  const acres = toAcres(area.value, area.unit);
  return acres === null ? area : { value: Number(acres.toFixed(2)), unit: 'acres' };
}

export function reconcile(
  det: DeterministicResult,
  llm: LlmParse | null,
  geo: CountyResolution | null,
): Reconciled {
  const postcode = det.postcode_full ?? det.postcode_outcode;

  // Deterministic quantities beat the model's; the model covers what regex
  // can't see (e.g. "seven acres" written out).
  const area = normaliseArea(det.area ?? llm?.area ?? null);

  // Explicit wording beats inference; inference beats nothing.
  const urgency = det.urgency ?? llm?.urgency ?? null;
  const target_date = det.target_date ?? llm?.target_date ?? null;

  const service: CanonicalService | null =
    llm && llm.service !== 'unmatched' ? llm.service : null;

  const attributes: Record<string, string> = {};
  for (const { name, value } of llm?.attributes ?? []) {
    if (name.trim()) attributes[name.trim()] = value;
  }

  const parse_confidence: Record<string, number> = {
    service: llm ? llm.service_confidence : 0,
    area: det.area ? 1 : llm?.area ? (llm.field_confidence.area ?? 0) : 0,
    location: postcode ? 1 : llm ? (llm.field_confidence.location ?? 0) : 0,
    urgency: det.urgency ? 1 : llm?.urgency ? (llm.field_confidence.urgency ?? 0) : 0,
    target_date: det.target_date ? 1 : 0,
  };

  const missing_fields: string[] = [];
  if (!service) missing_fields.push('service'); // unmatched renders alternatives-first
  if (!area) missing_fields.push('area');
  if (!postcode && !geo?.county_id) missing_fields.push('location');
  if (!urgency) missing_fields.push('urgency');

  return {
    parse_source: llm ? 'llm' : 'deterministic_fallback',
    service,
    service_verbatim: llm?.service_verbatim ?? '',
    service_alternatives: llm?.service_alternatives ?? [],
    area_value: area?.value ?? null,
    area_unit: area?.unit ?? null,
    postcode,
    county_id: geo?.county_id ?? null,
    boundary: null,
    area_mapped_value: null,
    gate_w3w: null,
    gate_width: null,
    county_candidates: geo?.candidates ?? [],
    county_choice_reason: null,
    county_name: geo?.county_name ?? null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    town: geo?.town ?? null,
    urgency,
    target_date,
    access_notes: llm?.access_notes ?? '',
    obstacles: llm?.obstacles ?? '',
    service_attributes: attributes,
    parse_confidence,
    missing_fields,
  };
}
