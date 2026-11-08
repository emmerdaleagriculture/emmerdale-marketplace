import { describe, expect, it } from 'vitest';
import { secureEqual } from '@/lib/secureEqual';

describe('secureEqual', () => {
  it('matches equal strings only', () => {
    expect(secureEqual('abc', 'abc')).toBe(true);
    expect(secureEqual('abc', 'abd')).toBe(false);
    expect(secureEqual('abc', 'abcd')).toBe(false);
    expect(secureEqual('', '')).toBe(true);
    expect(secureEqual('', 'a')).toBe(false);
  });
});
