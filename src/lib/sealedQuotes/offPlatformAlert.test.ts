import { describe, expect, it } from 'vitest';
import { isSecondAttempt } from './offPlatformAlert';

describe('second contact attempt', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  it('a refusal a day or more ago makes this one the second', () => {
    expect(isSecondAttempt(['2026-11-25T12:00:00Z'], now)).toBe(true);
    expect(isSecondAttempt(['2026-10-01T09:00:00Z', '2026-11-26T11:59:00Z'], now)).toBe(true);
  });
  it('the same attempt reworded, or the refusal just recorded, is still the first', () => {
    expect(isSecondAttempt([], now)).toBe(false);
    expect(isSecondAttempt(['2026-11-26T11:58:00Z', '2026-11-26T12:00:00Z'], now)).toBe(false);
    expect(isSecondAttempt(['2026-11-25T12:00:01Z'], now)).toBe(false);
  });
});
