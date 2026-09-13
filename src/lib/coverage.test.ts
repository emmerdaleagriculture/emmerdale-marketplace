import { describe, expect, it } from 'vitest';
import {
  COVERAGE_BINS,
  UK_COUNTY_NAMES,
  coverageBinsInUse,
  coverageFill,
  coverageMapLabel,
  coverageShapes,
} from '@/lib/coverage';

const counts = { Hampshire: 12, Berkshire: 7, Wiltshire: 4, Dorset: 2 };

describe('coverageShapes', () => {
  it('draws every county on the map, each with path data', () => {
    const shapes = coverageShapes(counts);
    expect(shapes).toHaveLength(UK_COUNTY_NAMES.length);
    expect(shapes.every((s) => s.d.startsWith('M'))).toBe(true);
  });

  it('shades by the bin the count falls in', () => {
    const by = Object.fromEntries(coverageShapes(counts).map((s) => [s.name, s.fill]));
    expect(by.Hampshire).toBe(coverageFill(10));
    expect(by.Berkshire).toBe(coverageFill(6));
    expect(by.Wiltshire).toBe(coverageFill(4));
    expect(by.Dorset).toBe(coverageFill(1));
    expect(by.Cornwall).toBe(COVERAGE_BINS.at(-1)!.fill);
  });

  it('gives every band its own shade, with 4 starting a new one', () => {
    expect(new Set(COVERAGE_BINS.map((b) => b.fill)).size).toBe(COVERAGE_BINS.length);
    expect(coverageFill(3)).toBe(coverageFill(1));
    expect(coverageFill(4)).not.toBe(coverageFill(3));
  });

  // The front page and /coverage-map.svg both render the public titles: a
  // customer must not be able to count our contractors in their county.
  it('keeps contractor numbers out of the public titles', () => {
    for (const s of coverageShapes(counts)) {
      expect(s.title).not.toMatch(/\d/);
      expect(s.title).toMatch(/covered$|not covered yet$/);
    }
  });

  it('calls any county with a contractor covered', () => {
    const by = Object.fromEntries(coverageShapes(counts).map((s) => [s.name, s.title]));
    expect(by.Dorset).toBe('Dorset — covered');
    expect(by.Cornwall).toBe('Cornwall — not covered yet');
  });

  it('gives the admin the numbers, correctly pluralised', () => {
    const by = Object.fromEntries(coverageShapes(counts, true).map((s) => [s.name, s.title]));
    expect(by.Hampshire).toBe('Hampshire — 12 contractors');
    expect(by.Cornwall).toBe('Cornwall — no coverage yet');
    expect(coverageShapes({ Wiltshire: 1 }, true).find((s) => s.name === 'Wiltshire')!.title).toBe(
      'Wiltshire — 1 contractor',
    );
  });
});

describe('coverageMapLabel', () => {
  it('counts the covered counties out of the whole map', () => {
    expect(coverageMapLabel(counts)).toBe(
      `Map of Great Britain showing contractor coverage: 4 of ${UK_COUNTY_NAMES.length} counties covered`,
    );
  });
});

describe('coverageBinsInUse', () => {
  it('drops the bins nothing on the map falls into', () => {
    expect(coverageBinsInUse(counts).map((b) => b.publicLabel)).toEqual([
      'Excellent coverage',
      'Strong coverage',
      'Good coverage',
      'Covered',
      'Not covered yet',
    ]);
  });

  it('drops "not covered yet" once every county has an operator', () => {
    const all = Object.fromEntries(UK_COUNTY_NAMES.map((n) => [n, 1]));
    expect(coverageBinsInUse(all).map((b) => b.publicLabel)).toEqual(['Covered']);
  });
});
