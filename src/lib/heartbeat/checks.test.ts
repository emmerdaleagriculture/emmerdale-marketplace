import { describe, expect, it } from 'vitest';
import { cronEveryMinutes, missedPinnedDate, pinnedDate } from './checks';

describe('missedPinnedDate', () => {
  it('flags a date passed in the last week, not one to come', () => {
    expect(missedPinnedDate('0 9 23 12 *', new Date('2026-11-23T18:00:00Z'))).toBe(false);
    expect(missedPinnedDate('0 9 23 12 *', new Date('2026-12-23T09:05:00Z'))).toBe(false);
    expect(missedPinnedDate('0 9 23 12 *', new Date('2026-12-23T10:00:00Z'))).toBe(true);
    expect(missedPinnedDate('0 9 23 12 *', new Date('2027-01-02T10:00:00Z'))).toBe(false);
    expect(missedPinnedDate('0 9 28 12 *', new Date('2027-01-02T10:00:00Z'))).toBe(true);
    expect(missedPinnedDate('*/5 * * * *', new Date('2027-01-02T10:00:00Z'))).toBe(false);
  });
});

describe('pinnedDate', () => {
  it('recognises a one-off date and nothing that repeats', () => {
    expect(pinnedDate('0 9 23 12 *')).toBe('23 Dec 09:00 UTC');
    expect(pinnedDate('35 3 1 * *')).toBeNull();
    expect(pinnedDate('30 6 * * 1')).toBeNull();
    expect(pinnedDate('*/5 * * * *')).toBeNull();
  });
});

describe('cronEveryMinutes', () => {
  it('reads the common shapes', () => {
    expect(cronEveryMinutes('* * * * *')).toBe(1);
    expect(cronEveryMinutes('*/5 * * * *')).toBe(5);
    expect(cronEveryMinutes('12,42 * * * *')).toBe(30);
    expect(cronEveryMinutes('7,22,37,52 * * * *')).toBe(15);
    expect(cronEveryMinutes('23 * * * *')).toBe(60);
    expect(cronEveryMinutes('25 6-20 * * *')).toBe(1440);
    expect(cronEveryMinutes('50 8 * * *')).toBe(1440);
    expect(cronEveryMinutes('30 6 * * 1')).toBe(10080);
    expect(cronEveryMinutes('35 3 1 * *')).toBe(44640);
  });
});
