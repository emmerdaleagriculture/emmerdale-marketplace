import { describe, expect, it } from 'vitest';
import { jobRevenueAverage, ukMonth } from './jobRevenueAverage';

const job = (at: string, margin: number, price = margin * 10) => ({ depositPaidAt: at, marginPence: margin, pricePence: price });
const NOW = new Date('2026-11-21T12:00:00Z');

describe('ukMonth', () => {
  it('uses UK time at a month boundary', () => {
    // 23:30 UTC on 31 Aug is 00:30 on 1 Sep in BST.
    expect(ukMonth('2026-08-31T23:30:00Z')).toBe('2026-09');
    expect(ukMonth('2026-12-31T23:30:00Z')).toBe('2026-12');
  });
});

describe('jobRevenueAverage', () => {
  it('averages complete months from the first job, leaving this month out', () => {
    const a = jobRevenueAverage(
      [job('2026-09-05T10:00:00Z', 20000), job('2026-09-20T10:00:00Z', 12000), job('2026-10-02T10:00:00Z', 19000), job('2026-11-10T10:00:00Z', 14000)],
      NOW,
    );
    expect(a.months).toBe(2);
    expect(a.from).toBe('2026-09');
    expect(a.to).toBe('2026-10');
    expect(a.marginPerMonth).toBe(25500);
    expect(a.jobsPerMonth).toBe(1.5);
    expect(a.thisMonth.marginPence).toBe(14000);
    expect(a.thisMonth.jobs).toBe(1);
  });

  it('counts empty months in between as zero', () => {
    const a = jobRevenueAverage([job('2026-07-15T10:00:00Z', 9000), job('2026-10-15T10:00:00Z', 3000)], NOW);
    expect(a.months).toBe(4);
    expect(a.marginPerMonth).toBe(3000);
  });

  it('looks back at most twelve months', () => {
    const a = jobRevenueAverage([job('2024-01-15T10:00:00Z', 99999), job('2026-10-15T10:00:00Z', 12000)], NOW);
    expect(a.months).toBe(12);
    expect(a.from).toBe('2025-11');
    expect(a.marginPerMonth).toBe(1000);
  });

  it('has no average before a full month has passed', () => {
    const a = jobRevenueAverage([job('2026-11-02T10:00:00Z', 5000)], NOW);
    expect(a.months).toBe(0);
    expect(a.marginPerMonth).toBeNull();
    expect(a.thisMonth.marginPence).toBe(5000);
  });
});
