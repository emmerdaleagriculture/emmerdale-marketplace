import { describe, expect, it } from 'vitest';
import { parseJobPath } from '@/lib/feedback/jobPath';

const TOKEN = 'ab'.repeat(24);

describe('parseJobPath', () => {
  it('reads the customer and contractor job pages', () => {
    expect(parseJobPath(`/my/${TOKEN}`)).toEqual({ side: 'customer', token: TOKEN });
    expect(parseJobPath(`/quote/${TOKEN}`)).toEqual({ side: 'contractor', token: TOKEN });
  });

  it('accepts a sub-page, query or hash after the token', () => {
    expect(parseJobPath(`/my/${TOKEN}/rate`)?.side).toBe('customer');
    expect(parseJobPath(`/quote/${TOKEN}?x=1`)?.side).toBe('contractor');
    expect(parseJobPath(`/my/${TOKEN}#messages`)?.token).toBe(TOKEN);
  });

  it('lower-cases a token typed in capitals', () => {
    expect(parseJobPath(`/my/${TOKEN.toUpperCase()}`)?.token).toBe(TOKEN);
  });

  it('ignores anything that is not a job page with a whole token', () => {
    for (const p of [null, undefined, '', '/', '/my', '/my/', `/my/${TOKEN.slice(1)}`, `/my/${TOKEN}x`, `/mystery/${TOKEN}`, `/quote/confirm/${TOKEN}`, `/admin/submissions/${TOKEN}`]) {
      expect(parseJobPath(p), String(p)).toBeNull();
    }
  });
});
