import { describe, expect, it } from 'vitest';
import { forArea, kgHaFromUnits, productRate, supplied, unitsPerAcre } from './fertMaths';

describe('fertiliser sums', () => {
  it('converts units an acre and kilos a hectare', () => {
    // The yard rule: 40 units an acre is about 50 kg/ha.
    expect(kgHaFromUnits(40)).toBeCloseTo(50.2, 1);
    expect(unitsPerAcre(50)).toBeCloseTo(39.8, 1);
  });
  it('finds the product rate for a nutrient rate', () => {
    // 50 kg N/ha from 34.5% ammonium nitrate is 145 kg/ha of product.
    expect(productRate(50, 34.5)).toBeCloseTo(144.9, 1);
    expect(productRate(50, 0)).toBeNull();
  });
  it('says what a product rate supplies', () => {
    expect(supplied(250, { n: 20, p: 10, k: 10 })).toEqual({ n: 50, p: 25, k: 25 });
  });
  it('counts bags for a field', () => {
    const r = forArea(145, 2, 25)!;
    expect(r.kg).toBe(290);
    expect(r.wholeBags).toBe(12);
    expect(forArea(125, 2, 25)!.wholeBags).toBe(10);
  });
});
