import { describe, expect, it } from 'vitest';
import { acresParam, distanceM, keepWalkPoint, measureArea, parseAcresParam, pathLengthM, type LngLat } from './areaMaths';

// A square about 100 m a side near Romsey (51°N): 0.0009° of latitude ≈ 100 m,
// and 0.0009 / cos(51°) ≈ 0.00143° of longitude ≈ 100 m.
const lat = 51;
const dLat = 100 / 111195;
const dLng = dLat / Math.cos((lat * Math.PI) / 180);
const square: LngLat[] = [
  [-1.5, lat],
  [-1.5 + dLng, lat],
  [-1.5 + dLng, lat + dLat],
  [-1.5, lat + dLat],
];

describe('distance', () => {
  it('measures 100 m north', () => {
    expect(distanceM([-1.5, lat], [-1.5, lat + dLat])).toBeCloseTo(100, 0);
  });
});

describe('area', () => {
  it('a 100 m square is a hectare, 2.47 acres, 400 m round', () => {
    const m = measureArea(square);
    expect(m.kind).toBe('area');
    if (m.kind !== 'area') return;
    expect(m.ha).toBeCloseTo(1, 2);
    expect(m.acres).toBeCloseTo(2.471, 2);
    expect(m.perimeterM).toBeCloseTo(400, 0);
  });

  it('gives nothing under three points', () => {
    expect(measureArea(square.slice(0, 2)).kind).toBe('none');
  });

  it('refuses an outline that crosses itself, but still gives the length', () => {
    const bowtie: LngLat[] = [square[0], square[2], square[1], square[3]];
    const m = measureArea(bowtie);
    expect(m.kind).toBe('crossed');
  });
});

describe('length', () => {
  it('an open line has no closing edge', () => {
    expect(pathLengthM(square, false)).toBeCloseTo(300, 0);
    expect(pathLengthM(square, true)).toBeCloseTo(400, 0);
  });
});

describe('walking the edge', () => {
  it('keeps a point only after a few metres, on a good fix', () => {
    const a: LngLat = [-1.5, lat];
    const near: LngLat = [-1.5, lat + dLat / 50]; // 2 m
    const far: LngLat = [-1.5, lat + dLat / 10]; // 10 m
    expect(keepWalkPoint(undefined, a, 5)).toBe(true);
    expect(keepWalkPoint(a, near, 5)).toBe(false);
    expect(keepWalkPoint(a, far, 5)).toBe(true);
    expect(keepWalkPoint(a, far, 40)).toBe(false);
    expect(keepWalkPoint(a, far, NaN)).toBe(false);
  });
});

describe('the acres handed to the calculators', () => {
  it('round-trips', () => {
    expect(acresParam(2.4710538)).toBe('2.47');
    expect(parseAcresParam('2.47')).toBe(2.47);
  });
  it('ignores rubbish', () => {
    expect(parseAcresParam(null)).toBeNull();
    expect(parseAcresParam('abc')).toBeNull();
    expect(parseAcresParam('-3')).toBeNull();
    expect(parseAcresParam('0')).toBeNull();
  });
});
