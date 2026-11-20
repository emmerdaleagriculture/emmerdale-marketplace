import { describe, expect, it } from 'vitest';
import { cronEveryMinutes } from './checks';

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
