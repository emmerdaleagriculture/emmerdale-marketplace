import { describe, expect, it } from 'vitest';
import {
  COVERAGE_BINS,
  UK_COUNTY_NAMES,
  coverageBinsInUse,
  coverageFill,
  coverageMapLabel,
  coverageShapes,
} from '@/lib/coverage';

const counts = { Hampshire: 7, Berkshire: 2, Wiltshire: 1 };

describe('coverageShapes', () => {
  it('draws every county on the map, each with path data', () => {
    const shapes = coverageShapes(counts);
    expect(shapes).toHaveLength(UK_COUNTY_NAMES.length);
    expect(shapes.every((s) => s.d.startsWith('M'))).toBe(true);
  });

  it('shades by the bin the count falls in', () => {
    const by = Object.fromEntries(coverageShapes(counts).map((s) => [s.name, s.fill]));
    expect(by.Hampshire).toBe(coverageFill(4));
    expect(by.Berkshire).toBe(coverageFill(2));
    expect(by.Wiltshire).toBe(coverageFill(1));
    expect(by.Cornwall).toBe(COVERAGE_BINS.at(-1)!.fill);
  });

  // The front page and /coverage-map.svg both render the public titles: a
  // customer must not be able to count our contractors in their county.
  it('keeps contractor numbers out of the public titles', () => {
    for (const s of coverageShapes(counts)) {
      expect(s.title).not.toMatch(/\d/);
      expect(s.title).toMatch(/covered$|not covered yet$/);
    }
  });

  it('gives the admin the numbers, correctly pluralised', () => {
    const by = Object.fromEntries(coverageShapes(counts, true).map((s) => [s.name, s.title]));
    expect(by.Hampshire).toBe('Hampshire — 7 contractors');
    expect(by.Wiltshire).toBe('Wiltshire — 1 contractor');
    expect(by.Cornwall).toBe('Cornwall — no coverage yet');
  });
});

describe('coverageMapLabel', () => {
  it('counts the covered counties out of the whole map', () => {
    expect(coverageMapLabel(counts)).toBe(
      `Map of Great Britain showing contractor coverage: 3 of ${UK_COUNTY_NAMES.length} counties covered`,
    );
  });
});

describe('coverageBinsInUse', () => {
  it('drops the bins nothing on the map falls into', () => {
    expect(coverageBinsInUse(counts).map((b) => b.publicLabel)).toEqual([
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
