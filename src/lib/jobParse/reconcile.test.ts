import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';
import type { DeterministicResult, LlmParse } from './schema';

const EMPTY_DET: DeterministicResult = {
  postcode_full: null,
  postcode_outcode: null,
  quantities: [],
  area: null,
  urgency: null,
  target_date: null,
  phone: null,
  email: null,
};

const BASE_LLM: LlmParse = {
  service: 'Paddock topping',
  service_verbatim: 'field topped',
  service_confidence: 0.9,
  service_alternatives: ['Flailing'],
  area: null,
  urgency: null,
  target_date: null,
  access_notes: null,
  obstacles: null,
  attributes: [],
  field_confidence: { area: 0, urgency: 0, location: 0 },
};

describe('reconcile', () => {
  it('deterministic numerics beat the model (transposed digits)', () => {
    const det: DeterministicResult = { ...EMPTY_DET, area: { value: 7, unit: 'acres' } };
    const llm: LlmParse = {
      ...BASE_LLM,
      area: { value: 17, unit: 'acres' },
      field_confidence: { area: 0.9, urgency: 0, location: 0 },
    };
    const r = reconcile(det, llm, null);
    expect(r.area_value).toBe(7);
    expect(r.parse_confidence.area).toBe(1);
  });

  it('llm = null produces the deterministic fallback shape (§6.4)', () => {
    const det: DeterministicResult = {
      ...EMPTY_DET,
      postcode_full: 'SO24 9AA',
      area: { value: 7, unit: 'acres' },
    };
    const r = reconcile(det, null, null);
    expect(r.parse_source).toBe('deterministic_fallback');
    expect(r.service).toBeNull();
    expect(r.postcode).toBe('SO24 9AA');
    expect(r.area_value).toBe(7);
    expect(r.missing_fields).toContain('service');
    expect(r.missing_fields).toContain('urgency');
    expect(r.missing_fields).not.toContain('area');
    expect(r.missing_fields).not.toContain('location');
  });

  it('normalises hectares to acres, keeps linear metres', () => {
    const ha = reconcile({ ...EMPTY_DET, area: { value: 2, unit: 'hectares' } }, null, null);
    expect(ha.area_unit).toBe('acres');
    expect(ha.area_value).toBeCloseTo(4.94, 2);

    const lm = reconcile({ ...EMPTY_DET, area: { value: 200, unit: 'linear_m' } }, null, null);
    expect(lm.area_unit).toBe('linear_m');
    expect(lm.area_value).toBe(200);
  });

  it('unmatched maps to null service and renders alternatives-first', () => {
    const llm: LlmParse = {
      ...BASE_LLM,
      service: 'unmatched',
      service_alternatives: ['Paddock topping', 'Flailing'],
    };
    const r = reconcile(EMPTY_DET, llm, null);
    expect(r.service).toBeNull();
    expect(r.service_alternatives).toEqual(['Paddock topping', 'Flailing']);
    expect(r.missing_fields).toContain('service');
  });

  it('county/lat/lng come only from the geocode', () => {
    const r = reconcile(EMPTY_DET, BASE_LLM, {
      ok: true,
      county_id: 4,
      county_name: 'Hampshire',
      lat: 51.08,
      lng: -1.16,
      via: 'admin_county',
    });
    expect(r.county_id).toBe(4);
    expect(r.county_name).toBe('Hampshire');
    expect(r.lat).toBe(51.08);
  });

  it('folds attribute pairs into a record', () => {
    const llm: LlmParse = {
      ...BASE_LLM,
      attributes: [{ name: 'vegetation_height', value: 'waist high' }],
    };
    const r = reconcile(EMPTY_DET, llm, null);
    expect(r.service_attributes).toEqual({ vegetation_height: 'waist high' });
  });
});
