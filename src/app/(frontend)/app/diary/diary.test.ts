import { describe, expect, it } from 'vitest';
import { isDay, isMonth, isTime, monthGrid, shiftMonth, sortDay, todayInLondon, type DiaryEntry } from './diary';

describe('monthGrid', () => {
  it('runs Monday to Sunday in whole weeks', () => {
    const g = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
    expect(g.length % 7).toBe(0);
    expect(g[0]).toEqual({ day: '2026-10-26', inMonth: false });
    expect(g[6]).toEqual({ day: '2026-11-01', inMonth: true });
    expect(g.at(-1)).toEqual({ day: '2026-12-06', inMonth: false });
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
  });
  it('needs no padding when the month starts on a Monday', () => {
    expect(monthGrid('2026-06')[0]).toEqual({ day: '2026-06-01', inMonth: true });
  });
  it('handles a leap February', () => {
    expect(monthGrid('2028-02').filter((c) => c.inMonth).at(-1)?.day).toBe('2028-02-29');
  });
});

describe('shiftMonth', () => {
  it('crosses years both ways', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('validation', () => {
  it('rejects days that do not exist', () => {
    expect(isDay('2026-11-17')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('17/11/2026')).toBe(false);
    expect(isMonth('2026-13')).toBe(false);
    expect(isTime('09:30')).toBe(true);
    expect(isTime('24:00')).toBe(false);
  });
});

describe('todayInLondon', () => {
  it('is the London date, not UTC, through summer time', () => {
    expect(todayInLondon(Date.UTC(2026, 6, 1, 23, 30))).toBe('2026-07-02');
  });
});

describe('sortDay', () => {
  const e = (id: string, start_time: string | null): DiaryEntry => ({ id, start_time, entry_date: '2026-11-17', title: id, details: null, done: false });
  it('puts timed entries first, in time order', () => {
    expect(sortDay([e('a', null), e('b', '14:00:00'), e('c', '08:00:00')]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});
