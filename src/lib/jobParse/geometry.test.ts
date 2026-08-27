import { describe, expect, it } from 'vitest';
import { areaDiscrepancy, parseBoundary, ringAreaAcres, ringAreaSqM } from './geometry';
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
