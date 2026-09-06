import { describe, expect, it } from 'vitest';
import { isSensitivePath, redactPath } from '@/lib/analyticsPaths';

const TOKEN = 'a'.repeat(48);

describe('isSensitivePath', () => {
  it('covers the token-addressed customer and contractor pages', () => {
    expect(isSensitivePath(`/my/${TOKEN}`)).toBe(true);
    expect(isSensitivePath(`/my/${TOKEN}/rate`)).toBe(true);
    expect(isSensitivePath(`/quote/${TOKEN}`)).toBe(true);
    expect(isSensitivePath('/quote/confirm/abc')).toBe(true);
  });

  it('covers the customer account list and the admin panel', () => {
    expect(isSensitivePath('/my')).toBe(true);
    expect(isSensitivePath('/admin')).toBe(true);
    expect(isSensitivePath('/admin/submissions/123')).toBe(true);
  });

  it('leaves the marketing and funnel pages alone — they are the point', () => {
    for (const p of ['/', '/start', '/start/complete', '/login', '/signup', '/won', '/notes']) {
      expect(isSensitivePath(p), p).toBe(false);
    }
  });

  it('does not match a path that merely begins with the same letters', () => {
    expect(isSensitivePath('/mystery')).toBe(false);
    expect(isSensitivePath('/quotes-explained')).toBe(false);
    expect(isSensitivePath('/administration')).toBe(false);
  });
});

describe('redactPath', () => {
  it('removes a token wherever it sits', () => {
    expect(redactPath(`/my/${TOKEN}`)).toBe('/my/[token]');
    expect(redactPath(`/my/${TOKEN}/rate`)).toBe('/my/[token]/rate');
    expect(redactPath(`/quote/${TOKEN}`)).toBe('/quote/[token]');
  });

  it('is case-insensitive, because tokens are hex either way', () => {
    expect(redactPath(`/quote/${'A'.repeat(48)}`)).toBe('/quote/[token]');
  });

  it('leaves an ordinary path untouched', () => {
    expect(redactPath('/paddock-maintenance/hampshire')).toBe('/paddock-maintenance/hampshire');
  });
});
