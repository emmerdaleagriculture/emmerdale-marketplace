import { describe, expect, it } from 'vitest';
import { UK_COUNTY_NAMES } from './coverage';
import { landCoverage } from './radiusCoverage';

// Every county treated as England except the few these checks lean on — the
// real mapping comes from the counties table.
const countryOf: Record<string, string> = Object.fromEntries(
  UK_COUNTY_NAMES.map((n) => [n, 'England']),
);
for (const n of ['Highland', 'Shetland Islands', 'Na h-Eileanan Siar', 'Argyll and Bute']) {
  countryOf[n] = 'Scotland';
}

describe('landCoverage', () => {
  it('is zero with no contractors', () => {
    expect(landCoverage([], 20, countryOf).overall).toBe(0);
  });

  it('a 20 mile circle inland in Hampshire is its true share of Great Britain', () => {
    // π·20² ≈ 1,257 sq mi of ~80,800 sq mi of land ≈ 1.6%. Winchester's circle
    // is almost all land, so the figure checks the projection and the grid
    // together: a wrong fit would put part of it in the sea or miss it.
    const res = landCoverage([{ lat: 51.0632, lng: -1.308 }], 20, countryOf);
    expect(res.overall).toBeGreaterThan(1.2);
    expect(res.overall).toBeLessThan(1.9);
  });

  it('covers everything with a radius spanning the country', () => {
    const res = landCoverage([{ lat: 55, lng: -3 }], 500, countryOf);
    expect(res.overall).toBe(100);
  });

  it('a circle out at sea covers nothing', () => {
    // Mid North Sea, well over 20 miles from any coast.
    expect(landCoverage([{ lat: 55, lng: 3.5 }], 20, countryOf).overall).toBe(0);
  });
});
