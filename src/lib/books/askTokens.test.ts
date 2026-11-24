import { describe, expect, it } from 'vitest';
import { balanceOf } from './askTokens';

const NOW = Date.parse('2026-11-24T12:00:00Z');

describe('balanceOf', () => {
  it('is empty with no lots', () => {
    expect(balanceOf([], NOW)).toEqual({ total: 0, free: 0, kept: 0, freeExpires: null });
  });
  it('splits the free allowance from packs and gifts', () => {
    const b = balanceOf(
      [
        { kind: 'free', tokens: 100, remaining: 60, expires_at: '2027-11-24T12:00:00Z' },
        { kind: 'pack', tokens: 100, remaining: 100, expires_at: null },
        { kind: 'gift', tokens: 20, remaining: 5, expires_at: null },
      ],
      NOW,
    );
    expect(b).toEqual({ total: 165, free: 60, kept: 105, freeExpires: '2027-11-24T12:00:00Z' });
  });
  it('leaves out a lapsed allowance and spent lots', () => {
    const b = balanceOf(
      [
        { kind: 'free', tokens: 100, remaining: 40, expires_at: '2026-11-24T11:59:59Z' },
        { kind: 'pack', tokens: 100, remaining: 0, expires_at: null },
      ],
      NOW,
    );
    expect(b).toEqual({ total: 0, free: 0, kept: 0, freeExpires: null });
  });
});
