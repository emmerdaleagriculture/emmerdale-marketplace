import { describe, expect, it } from 'vitest';
import { serviceFromPick, servicesMentioned } from './servicePick';

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

  it('leaves services without a flow of their own as words', () => {
    expect(serviceFromPick('harrowing')).toBeNull();
    expect(serviceFromPick('hedge-cutting')).toBeNull();
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
