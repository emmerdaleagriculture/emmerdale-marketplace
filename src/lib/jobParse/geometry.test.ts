import { describe, expect, it } from 'vitest';
import {
  areaDiscrepancy,
  jobAcres,
  measuredAcres,
  parseBoundary,
  ringAreaAcres,
  ringAreaSqM,
  ringIsSimple,
} from './geometry';
import type { LngLat } from './geometry';

// ~100m × ~100m square near Alresford (lat 51.08). 1° lat ≈ 111,195m;
// 1° lng ≈ 111,195 × cos(51.08) ≈ 69,850m.
const DLAT = 100 / 111195;
const DLNG = 100 / (111195 * Math.cos((51.08 * Math.PI) / 180));
const SQUARE_100M: LngLat[] = [
  [-1.16, 51.08],
  [-1.16 + DLNG, 51.08],
  [-1.16 + DLNG, 51.08 + DLAT],
  [-1.16, 51.08 + DLAT],
];

describe('ringArea', () => {
  it('measures a 100m square as ~10,000 m² / ~2.47 acres', () => {
    expect(ringAreaSqM(SQUARE_100M)).toBeCloseTo(10000, -1); // within ~5 m²
    expect(ringAreaAcres(SQUARE_100M)).toBeCloseTo(2.471, 2);
  });

  it('accepts open or closed rings identically', () => {
    const closed = [...SQUARE_100M, SQUARE_100M[0]];
    expect(ringAreaSqM(closed)).toBeCloseTo(ringAreaSqM(SQUARE_100M), 6);
  });

  it('returns 0 for degenerate rings', () => {
    expect(ringAreaSqM([])).toBe(0);
    expect(ringAreaSqM([SQUARE_100M[0], SQUARE_100M[1]])).toBe(0);
  });
});

// The same four corners tapped in a figure of eight: two edges cross, and
// the shoelace lobes cancel to nothing.
const BOWTIE_100M: LngLat[] = [SQUARE_100M[0], SQUARE_100M[2], SQUARE_100M[1], SQUARE_100M[3]];

const SCRIBBLE_14_ACRES: LngLat[] = [
  [-1.92318, 51.560614],
  [-1.922936, 51.561548],
  [-1.921524, 51.561332],
  [-1.920326, 51.560185],
  [-1.923884, 51.561897],
  [-1.923655, 51.562424],
  [-1.920526, 51.561759],
  [-1.920719, 51.561279],
  [-1.921785, 51.560405],
  [-1.920294, 51.560138],
  [-1.919478, 51.560952],
  [-1.92054, 51.561165],
  [-1.922282, 51.560467],
  [-1.921746, 51.560367],
  [-1.919568, 51.560083],
  [-1.919707, 51.559789],
  [-1.916245, 51.559858],
  [-1.916513, 51.560345],
  [-1.916928, 51.560781],
  [-1.919457, 51.560503],
];

describe('ringIsSimple / measuredAcres', () => {
  it('passes a plain outline, open or closed', () => {
    expect(ringIsSimple(SQUARE_100M)).toBe(true);
    expect(ringIsSimple([...SQUARE_100M, SQUARE_100M[0]])).toBe(true);
    expect(measuredAcres(SQUARE_100M)).toBeCloseTo(2.47, 2);
  });

  it('fails a ring that crosses itself, and refuses to put a number on it', () => {
    expect(ringIsSimple(BOWTIE_100M)).toBe(false);
    expect(ringAreaAcres(BOWTIE_100M)).toBeCloseTo(0, 3); // the lobes cancel
    expect(measuredAcres(BOWTIE_100M)).toBeNull();
  });

  it('a scribble across a field measures nothing, however many points', () => {
    // A real boundary (Wiltshire, October 2026): 20 points tapped back and
    // forth across a 14-acre field. The shoelace lobes cancelled to 0.37
    // acres, and that was shown to contractors as the size of the job.
    expect(ringIsSimple(SCRIBBLE_14_ACRES)).toBe(false);
    expect(ringAreaAcres(SCRIBBLE_14_ACRES)).toBeCloseTo(0.37, 1);
    expect(measuredAcres(SCRIBBLE_14_ACRES)).toBeNull();
  });

  it('needs three points to be a shape', () => {
    expect(ringIsSimple([SQUARE_100M[0], SQUARE_100M[1]])).toBe(false);
    expect(measuredAcres([SQUARE_100M[0], SQUARE_100M[1]])).toBeNull();
  });
});

describe('jobAcres', () => {
  it('prefers the measurement unless the customer kept their own figure', () => {
    expect(jobAcres({ area_value: 14, area_unit: 'acres', area_mapped_value: 0.37, area_source: 'both' })).toBe(0.37);
    expect(jobAcres({ area_value: 14, area_unit: 'acres', area_mapped_value: 0.37, area_source: 'stated' })).toBe(14);
    expect(jobAcres({ area_value: 14, area_unit: 'acres', area_mapped_value: null, area_source: 'stated' })).toBe(14);
    expect(jobAcres({ area_value: null, area_unit: null, area_mapped_value: 3.2, area_source: 'mapped' })).toBe(3.2);
  });

  it('never turns metres of fence into acres', () => {
    expect(jobAcres({ area_value: 200, area_unit: 'linear_m', area_mapped_value: null, area_source: 'stated' })).toBeNull();
  });
});

describe('parseBoundary', () => {
  const valid = JSON.stringify({ type: 'Polygon', coordinates: [SQUARE_100M] });

  it('accepts a valid polygon and closes the ring', () => {
    const p = parseBoundary(valid);
    expect(p).not.toBeNull();
    const ring = p!.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('rejects malformed and out-of-bounds input', () => {
    expect(parseBoundary('not json')).toBeNull();
    expect(parseBoundary(JSON.stringify({ type: 'Point', coordinates: [0, 0] }))).toBeNull();
    expect(
      parseBoundary(JSON.stringify({ type: 'Polygon', coordinates: [[[150, 51], [151, 51], [151, 52]]] })),
    ).toBeNull(); // Pacific — outside the British Isles bbox
    expect(
      parseBoundary(JSON.stringify({ type: 'Polygon', coordinates: [SQUARE_100M, SQUARE_100M] })),
    ).toBeNull(); // holes not allowed
    expect(parseBoundary('x'.repeat(30000))).toBeNull(); // size cap
  });
});

describe('areaDiscrepancy', () => {
  it('flags over 20%, not under, never without both figures', () => {
    expect(areaDiscrepancy(7, 9, 20)).toBe(true); // ~22% off measured
    expect(areaDiscrepancy(7, 7.5, 20)).toBe(false);
    expect(areaDiscrepancy(null, 9, 20)).toBe(false);
    expect(areaDiscrepancy(7, null, 20)).toBe(false);
  });
});
