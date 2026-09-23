import { describe, expect, it } from 'vitest';
import { serviceFromPick, servicesMentioned } from './servicePick';

describe('serviceFromPick', () => {
  it('classifies a fencing pick', () => {
    expect(serviceFromPick('fencing')).toBe('Fencing');
  });

  it('leaves services without a flow of their own as words', () => {
    expect(serviceFromPick('topping')).toBeNull();
    expect(serviceFromPick('weed-control')).toBeNull();
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

  it('does not read fencing into other words', () => {
    expect(servicesMentioned('paddock topping, 5 acres')).toEqual([]);
    expect(servicesMentioned('defence of the realm')).toEqual([]);
  });
});
