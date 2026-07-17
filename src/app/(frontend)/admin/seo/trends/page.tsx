import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo } from '@/lib/gsc';
import { seoGuard } from '../guard';
import { SubNav } from '../SubNav';
import { TimeSeriesChart } from '../TimeSeriesChart';
import styles from '../seo.module.css';

export const metadata: Metadata = {
  title: 'Trends — Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 90;
const COMPARE_DAYS = 28;
const GSC_LAG_DAYS = 3;

function fmtNumber(n: number) {
  return n.toLocaleString('en-GB');
}
function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}
function fmtPosition(n: number) {
  return n.toFixed(1);
}

type Totals = { clicks: number; impressions: number; ctr: number; position: number };
function totalsFromRows(rows: Totals[]): Totals {
  return rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (before === 0) return <span className={styles.deltaFlat}>—</span>;
  const change = ((now - before) / before) * 100;
  const positive = invert ? change < 0 : change > 0;
  const cls = Math.abs(change) < 0.5 ? styles.deltaFlat : positive ? styles.deltaUp : styles.deltaDown;
  const arrow = Math.abs(change) < 0.5 ? '·' : positive ? '↑' : '↓';
  return (
    <span className={cls}>
      {arrow} {change > 0 ? '+' : ''}
      {change.toFixed(1)}%
    </span>
  );
}

export default async function TrendsPage() {
  const { block } = await seoGuard('/admin/seo/trends');
  if (block) return block;

  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);
  const compareEnd = isoDaysAgo(GSC_LAG_DAYS);
  const compareStart = isoDaysAgo(GSC_LAG_DAYS + COMPARE_DAYS);
  const prevEnd = isoDaysAgo(GSC_LAG_DAYS + COMPARE_DAYS + 1);
  const prevStart = isoDaysAgo(GSC_LAG_DAYS + 2 * COMPARE_DAYS + 1);

  let series: Array<{ date: string; clicks: number; impressions: number }> = [];
  let nowTotals: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let prevTotals: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let errMsg: string | null = null;

  try {
    const [byDay, now, prev] = await Promise.all([
      gscQuery({ startDate, endDate, dimensions: ['date'], rowLimit: 1000 }),
      gscQuery({ startDate: compareStart, endDate: compareEnd, dimensions: [], rowLimit: 1 }),
      gscQuery({ startDate: prevStart, endDate: prevEnd, dimensions: [], rowLimit: 1 }),
    ]);
    series = byDay
      .map((r) => ({ date: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions }))
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    nowTotals = totalsFromRows(now);
    prevTotals = totalsFromRows(prev);
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className={styles.page}>
      <SubNav active="/admin/seo/trends" />
      <header className={styles.head}>
        <div>
          <h1>Trends</h1>
          <p className={styles.range}>
            {RANGE_DAYS}-day chart &middot; {COMPARE_DAYS}d-vs-prior comparison &middot; ending {endDate}
          </p>
        </div>
      </header>

      {errMsg && (
        <section className={styles.error}>
          <h2>Couldn&apos;t load trends</h2>
          <pre>{errMsg}</pre>
        </section>
      )}

      <section className={styles.totals}>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Clicks ({COMPARE_DAYS}d)</p>
          <p className={styles.totalValue}>{fmtNumber(nowTotals.clicks)}</p>
          <Delta now={nowTotals.clicks} before={prevTotals.clicks} />
          <p className={styles.deltaSub}>was {fmtNumber(prevTotals.clicks)}</p>
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Impressions</p>
          <p className={styles.totalValue}>{fmtNumber(nowTotals.impressions)}</p>
          <Delta now={nowTotals.impressions} before={prevTotals.impressions} />
          <p className={styles.deltaSub}>was {fmtNumber(prevTotals.impressions)}</p>
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>CTR</p>
          <p className={styles.totalValue}>{pct(nowTotals.ctr)}</p>
          <Delta now={nowTotals.ctr} before={prevTotals.ctr} />
          <p className={styles.deltaSub}>was {pct(prevTotals.ctr)}</p>
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Avg position</p>
          <p className={styles.totalValue}>{fmtPosition(nowTotals.position)}</p>
          <Delta now={nowTotals.position} before={prevTotals.position} invert />
          <p className={styles.deltaSub}>was {fmtPosition(prevTotals.position)}</p>
        </div>
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>Daily clicks &amp; impressions</h2>
        </div>
        <p className={styles.tableNote}>
          Last {RANGE_DAYS} days of Search traffic. Clicks (solid) on the left axis, impressions
          (dashed) on the right.
        </p>
        <TimeSeriesChart data={series} />
      </section>
    </main>
  );
}
