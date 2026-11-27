import { describe, expect, it } from 'vitest';
import { PRODUCTS, WEEDS, optionsFor, productOf } from './weeds';
import { tidy } from './weedId';

describe('weed data', () => {
  it('names only products that exist, once each per weed', () => {
    for (const w of WEEDS) {
      const seen = new Set<string>();
      for (const o of w.options) {
        expect(() => productOf(o.product)).not.toThrow();
        expect(seen.has(o.product), `${w.slug} lists ${o.product} twice`).toBe(false);
        seen.add(o.product);
      }
      expect(w.options.length).toBeGreaterThan(0);
    }
  });
  it('has unique slugs and a MAPP number on every product', () => {
    expect(new Set(WEEDS.map((w) => w.slug)).size).toBe(WEEDS.length);
    expect(new Set(PRODUCTS.map((p) => p.slug)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) expect(p.mapp).toMatch(/^\d{5}$/);
  });
  it('gives the reason whenever a product is barred from horse paddocks', () => {
    for (const p of PRODUCTS) if (p.horses === 'no') expect(p.horseNote, p.slug).toBeTruthy();
  });
  it('never offers a horse-barred product for a horse paddock', () => {
    const thistle = WEEDS.find((w) => w.slug === 'creeping-thistle')!;
    const horses = optionsFor(thistle, 'horses');
    expect(horses.usable.map((o) => o.product)).not.toContain('thistlex');
    expect(horses.ruledOut.map((o) => o.product)).toEqual(expect.arrayContaining(['thistlex', 'thistlex-pro', 'forefront-t']));
    expect(optionsFor(thistle, 'livestock').ruledOut).toEqual([]);
    for (const w of WEEDS) for (const o of optionsFor(w, 'horses').usable) expect(productOf(o.product).horses).toBe('yes');
  });
});

describe('photo answer', () => {
  const slugs = WEEDS.map((w) => w.slug);
  it('keeps known slugs and drops invented ones', () => {
    const a = tidy({ slug: 'common-ragwort', name: 'Common ragwort', latin: 'Jacobaea vulgaris', confidence: 1.4, alternatives: ['made-up', 'common-ragwort', 'dandelion'], why: 'x' }, slugs);
    expect(a.slug).toBe('common-ragwort');
    expect(a.confidence).toBe(1);
    expect(a.alternatives).toEqual(['dandelion']);
  });
  it('handles a plant off the list and no plant at all', () => {
    expect(tidy({ slug: 'other', name: 'Yarrow', latin: 'Achillea millefolium', confidence: 0.7, alternatives: [], why: '' }, slugs)).toMatchObject({ slug: null, name: 'Yarrow' });
    expect(tidy({ slug: 'none', name: 'field', latin: '', confidence: 0.2, alternatives: [], why: '' }, slugs)).toMatchObject({ slug: null, name: null });
  });
});
