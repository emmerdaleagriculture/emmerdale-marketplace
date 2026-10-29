import { describe, expect, it } from 'vitest';
import { coverageLine, looksLikePostcode } from '@/lib/coverageLine';

describe('looksLikePostcode', () => {
  it('accepts outcodes and full postcodes in any case or spacing', () => {
    for (const pc of ['SO51', 'so51', 'SO51 6FP', 'so516fp', 'W1A 1AA', 'EC1A1BB', 'BT9 5AB']) {
      expect(looksLikePostcode(pc), pc).toBe(true);
    }
  });
  it('rejects half-typed and non-postcode input', () => {
    for (const pc of ['', 'S', 'SO', 'Romsey', 'SO51 6', '12345', 'near Winchester']) {
      expect(looksLikePostcode(pc), pc).toBe(false);
    }
  });
});

describe('coverageLine', () => {
  const ok = (count: number) => ({ ok: true as const, count, county: 'Hampshire', outcode: 'SO51' });

  it('pluralises and names the place the customer typed', () => {
    expect(coverageLine(ok(41), 'SO51 6FP')).toBe('41 vetted contractors cover SO51 6FP.');
    expect(coverageLine(ok(1), 'SO51')).toBe('1 vetted contractor covers SO51.');
  });
  it('falls back to the outcode when nothing was typed', () => {
    expect(coverageLine(ok(3), '')).toBe('3 vetted contractors cover SO51.');
  });
  it('says so, gently, when nobody covers the postcode', () => {
    expect(coverageLine(ok(0), 'ZE2 9AA')).toMatch(/don’t have a contractor near ZE2 9AA yet/);
  });
  it('stays quiet on a border postcode and a failed lookup', () => {
    expect(coverageLine({ ok: false, reason: 'border' }, 'GU31')).toBeNull();
    expect(coverageLine({ ok: false, reason: 'lookup' }, 'GU31')).toBeNull();
    expect(coverageLine({ ok: false, reason: 'shape' }, 'GU31')).toBeNull();
  });
  it('tells them when the postcode does not exist', () => {
    expect(coverageLine({ ok: false, reason: 'unknown' }, 'ZZ1 1ZZ')).toMatch(/can’t place/);
  });
});
