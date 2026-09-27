import { describe, expect, it } from 'vitest';
import { HOME_SERVICES } from '@/lib/home/services';
import { CANONICAL_SERVICES } from './services';
import { choicesFromPick, serviceFromPick, servicesMentioned } from './servicePick';

describe('serviceFromPick', () => {
  it('classifies a fencing pick', () => {
    expect(serviceFromPick('fencing')).toBe('Fencing');
  });

  it('reads the merged weed card as Weed control', () => {
    expect(serviceFromPick('weed-control')).toBe('Weed control');
  });

  it('classifies a topping pick, so its questions are asked', () => {
    expect(serviceFromPick('topping')).toBe('Paddock topping');
  });

  it('classifies every card that is a single job, flow or not', () => {
    expect(serviceFromPick('harrowing')).toBe('Harrowing');
    expect(serviceFromPick('hedge-cutting')).toBe('Hedge cutting');
    expect(serviceFromPick('muck-sweeping')).toBe('Manure sweeping');
  });

  it('every card either classifies or offers its jobs as a choice', () => {
    for (const card of HOME_SERVICES) {
      const resolved = serviceFromPick(card.slug) ?? choicesFromPick(card.slug)[0] ?? null;
      expect(resolved, card.slug).not.toBeNull();
      expect(CANONICAL_SERVICES as readonly string[], card.slug).toContain(resolved);
    }
  });

  it('offers a merged card back as its two jobs rather than choosing one', () => {
    expect(serviceFromPick('land-clearance')).toBeNull();
    expect(choicesFromPick('land-clearance')).toEqual(['Land clearance', 'Ditch clearance']);
    expect(choicesFromPick('harrowing')).toEqual([]);
  });

  it('ignores nothing and nonsense', () => {
    expect(serviceFromPick(null)).toBeNull();
    expect(serviceFromPick('')).toBeNull();
    expect(serviceFromPick('Fencing')).toBeNull(); // slugs, not names
  });
});

describe('servicesMentioned', () => {
  it('offers fencing when the description says so', () => {
    expect(servicesMentioned('Need 40m of post and rail fencing')).toEqual(['Fencing']);
    expect(servicesMentioned('new fence along the lane')).toEqual(['Fencing']);
  });

  it('offers weed control and spraying from the words that mean them', () => {
    expect(servicesMentioned('ragwort in the paddock')).toEqual(['Weed control']);
    expect(servicesMentioned('need the field sprayed for docks')).toEqual([
      'Spraying',
      'Weed control',
    ]);
    expect(servicesMentioned('topping, some thistles')).toEqual(['Paddock topping', 'Weed control']);
  });

  it('offers topping first when a topping job mentions weeds', () => {
    expect(
      servicesMentioned('Orchard topping Spring, summer to control Bracken, creeping thistle, nettle'),
    ).toEqual(['Paddock topping', 'Weed control']);
    expect(servicesMentioned('Weed control & spraying, topping and harrowing')).toEqual([
      'Weed control',
      'Spraying',
      'Paddock topping',
    ]);
  });

  it('does not read fencing into other words', () => {
    expect(servicesMentioned('paddock topping, 5 acres')).not.toContain('Fencing');
    expect(servicesMentioned('defence of the realm')).toEqual([]);
  });
});
