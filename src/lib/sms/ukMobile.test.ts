import { describe, expect, it } from 'vitest';
import { ukMobile } from './ukMobile';

describe('ukMobile', () => {
  it('normalises the usual ways of writing a UK mobile', () => {
    for (const raw of ['07700 900123', '+44 (0)7700 900123', '447700900123', '0044 7700 900123', '+447700900123']) {
      expect(ukMobile(raw)).toBe('+447700900123');
    }
  });
  it('refuses landlines, short numbers and foreign numbers', () => {
    for (const raw of ['01962 123456', '07700 90012', '+33 6 12 34 56 78', '']) {
      expect(ukMobile(raw)).toBeNull();
    }
  });
});
