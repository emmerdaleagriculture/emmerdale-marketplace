/**
 * Average monthly revenue from jobs, to sit beside membership MRR on the
 * admin Money page. A job counts in the month its deposit was paid (when it
 * became money), at its agreed figures: our margin (what we keep) and the
 * customer's price. The average is over complete calendar months only, UK
 * time, from the first month with a job up to last month and at most the
 * last twelve: the month in progress would drag it down, so it is reported
 * separately as "this month so far".
 */

export type JobForAverage = { depositPaidAt: string; marginPence: number; pricePence: number };

export type JobRevenueAverage = {
  /** Complete months averaged over; 0 = none yet (the averages are then null). */
  months: number;
  /** First and last month averaged, 'YYYY-MM'. */
  from: string | null;
  to: string | null;
  marginPerMonth: number | null;
  pricePerMonth: number | null;
  jobsPerMonth: number | null;
  thisMonth: { marginPence: number; pricePence: number; jobs: number };
};

const MAX_MONTHS = 12;

/** 'YYYY-MM' of an instant in UK time. */
export function ukMonth(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function jobRevenueAverage(jobs: JobForAverage[], now: Date = new Date()): JobRevenueAverage {
  const current = ukMonth(now);
  const lastFull = addMonths(current, -1);
  const byMonth = new Map<string, { margin: number; price: number; jobs: number }>();
  for (const j of jobs) {
    const m = ukMonth(j.depositPaidAt);
    const row = byMonth.get(m) ?? { margin: 0, price: 0, jobs: 0 };
    row.margin += j.marginPence;
    row.price += j.pricePence;
    row.jobs += 1;
    byMonth.set(m, row);
  }
  const t = byMonth.get(current);
  const thisMonth = { marginPence: t?.margin ?? 0, pricePence: t?.price ?? 0, jobs: t?.jobs ?? 0 };

  const first = [...byMonth.keys()].filter((m) => m <= lastFull).sort()[0];
  if (!first) {
    return { months: 0, from: null, to: null, marginPerMonth: null, pricePerMonth: null, jobsPerMonth: null, thisMonth };
  }
  const months = Math.min(MAX_MONTHS, monthsBetween(first, lastFull) + 1);
  const from = addMonths(lastFull, -(months - 1));
  let margin = 0;
  let price = 0;
  let count = 0;
  for (const [m, row] of byMonth) {
    if (m < from || m > lastFull) continue;
    margin += row.margin;
    price += row.price;
    count += row.jobs;
  }
  return {
    months,
    from,
    to: lastFull,
    marginPerMonth: margin / months,
    pricePerMonth: price / months,
    jobsPerMonth: count / months,
    thisMonth,
  };
}
