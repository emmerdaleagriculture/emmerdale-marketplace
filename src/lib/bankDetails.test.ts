import { describe, expect, it } from 'vitest';
import {
  codeMatches,
  hashCode,
  holdUntil,
  last4,
  makeCode,
  maskEmail,
  maskSortCode,
  normaliseAccountName,
  normaliseAccountNumber,
  normaliseSortCode,
  onHold,
} from './bankDetails';

describe('bank details', () => {
  it('normalises sort codes however typed', () => {
    expect(normaliseSortCode('123456')).toBe('12-34-56');
    expect(normaliseSortCode('12-34-56')).toBe('12-34-56');
    expect(normaliseSortCode(' 12 34 56 ')).toBe('12-34-56');
    expect(normaliseSortCode('12345')).toBeNull();
    expect(normaliseSortCode('12-34-5a')).toBeNull();
    expect(normaliseSortCode('000000')).toBeNull();
  });

  it('pads seven-digit accounts and rejects the rest', () => {
    expect(normaliseAccountNumber('12345678')).toBe('12345678');
    expect(normaliseAccountNumber('1234 5678')).toBe('12345678');
    expect(normaliseAccountNumber('1234567')).toBe('01234567');
    expect(normaliseAccountNumber('123456')).toBeNull();
    expect(normaliseAccountNumber('123456789')).toBeNull();
    expect(normaliseAccountNumber('00000000')).toBeNull();
  });

  it('checks the account name', () => {
    expect(normaliseAccountName('  Hampshire   Paddock  ')).toBe('Hampshire Paddock');
    expect(normaliseAccountName('A')).toBeNull();
  });

  it('masks', () => {
    expect(last4('12345678')).toBe('5678');
    expect(maskSortCode('12-34-56')).toBe('••-••-56');
    expect(maskEmail('tom@example.com')).toBe('t•••@example.com');
  });

  it('holds payouts for 72 hours', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    const until = holdUntil(now);
    expect(until.toISOString()).toBe('2026-11-23T10:00:00.000Z');
    expect(onHold(until.toISOString(), new Date('2026-11-23T09:59:00Z'))).toBe(true);
    expect(onHold(until.toISOString(), new Date('2026-11-23T10:01:00Z'))).toBe(false);
    expect(onHold(null, now)).toBe(false);
  });

  it('makes six-digit codes and checks them against the contractor', () => {
    for (let i = 0; i < 50; i++) expect(makeCode()).toMatch(/^\d{6}$/);
    const h = hashCode('c1', '012345');
    expect(codeMatches('c1', '012345', h)).toBe(true);
    expect(codeMatches('c1', '012 345', h)).toBe(true);
    expect(codeMatches('c1', '012346', h)).toBe(false);
    expect(codeMatches('c2', '012345', h)).toBe(false);
  });
});
