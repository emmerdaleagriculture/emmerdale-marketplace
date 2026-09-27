import { describe, expect, it } from 'vitest';
import { cleanSignupSource } from './signupSource';

describe('cleanSignupSource', () => {
  it('keeps known string keys, trimmed', () => {
    expect(cleanSignupSource({ landing: ' paddock-care ', utm_source: 'fb', other: 'x' })).toEqual({
      landing: 'paddock-care',
      utm_source: 'fb',
    });
  });

  it('drops values that are not strings, and nothing-at-all becomes null', () => {
    expect(cleanSignupSource({ landing: 1, referrer: { a: 1 }, utm_campaign: 'c' })).toEqual({
      utm_campaign: 'c',
    });
    expect(cleanSignupSource({ landing: 1 })).toBeNull();
    expect(cleanSignupSource('paddock-care')).toBeNull();
    expect(cleanSignupSource(null)).toBeNull();
  });
});
