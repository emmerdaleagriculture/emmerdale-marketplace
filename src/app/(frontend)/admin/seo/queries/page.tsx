import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';
import { seoGuard } from '../guard';
import { SubNav } from '../SubNav';
import styles from '../seo.module.css';

export const metadata: Metadata = {
  title: 'Queries — Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 28;
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

type Row = GscRow & { keys?: string[] };
function rowKey(r: Row) {
  return r.keys?.[0] ?? '—';
}

export default async function QueriesPage() {
  const { block } = await seoGuard('/admin/seo/queries');
  if (block) return block;

  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);
  const prevEnd = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS + 1);
  const prevStart = isoDaysAgo(GSC_LAG_DAYS + 2 * RANGE_DAYS + 1);

  let now: Row[] = [];
  let prev: Row[] = [];
  let errMsg: string | null = null;

  try {
    const [a, b] = await Promise.all([
      gscQuery({ startDate, endDate, dimensions: ['query'], rowLimit: 500 }),
      gscQuery({ startDate: prevStart, endDate: prevEnd, dimensions: ['query'], rowLimit: 500 }),
    ]);
    now = a;
    prev = b;
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }

  // Almost-there: positions 4-10 sorted by impressions desc.
  const almostThere = [...now]
    .filter((r) => r.position >= 4 && r.position <= 10 && r.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  // CTR opportunity: high impressions, below-median CTR.
  const positiveImpr = now.filter((r) => r.impressions > 0);
  const sortedCtr = [...positiveImpr].map((r) => r.ctr).sort((a, b) => a - b);
  const medianCtr = sortedCtr.length ? sortedCtr[Math.floor(sortedCtr.length / 2)] ?? 0 : 0;
  const ctrOpps = positiveImpr
    .filter((r) => r.impressions >= 25 && r.ctr < medianCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  // Winners / losers: position changes vs prior period (lower is better).
  const prevByKey = new Map(prev.map((r) => [rowKey(r), r]));
  const movements = now
    .filter((r) => prevByKey.has(rowKey(r)))
    .map((r) => {
      const before = prevByKey.get(rowKey(r))!;
      return {
        key: rowKey(r),
        nowPos: r.position,
        prevPos: before.position,
        delta: r.position - before.position, // negative = improved
        clicks: r.clicks,
      };
    })
    .filter((m) => Math.abs(m.delta) >= 1 && m.clicks > 0);
  const winners = movements.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 15);
  const losers = movements.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 15);

  const allSorted = [...now].sort((a, b) => b.clicks - a.clicks);

  return (
    <main className={styles.page}>
      <SubNav active="/admin/seo/queries" />
      <header className={styles.head}>
        <div>
          <h1>Queries</h1>
          <p className={styles.range}>
            Last {RANGE_DAYS} days &middot; {startDate} → {endDate}
          </p>
        </div>
      </header>

      {errMsg && (
        <section className={styles.error}>
          <h2>Couldn&apos;t load queries</h2>
          <pre>{errMsg}</pre>
        </section>
      )}

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>
            Almost there <span className={styles.badge}>positions 4–10</span>
          </h2>
        </div>
        <p className={styles.tableNote}>
          Queries you rank 4th–10th for, ordered by impressions. Small improvements
          (better titles, internal linking, content depth) can push these onto page 1
          where the click-through is much higher.
        </p>
        {almostThere.length === 0 ? (
          <p className={styles.muted}>Nothing in this range yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Query</th>
                <th className={styles.num}>Clicks</th>
                <th className={styles.num}>Impr.</th>
                <th className={styles.num}>CTR</th>
                <th className={styles.num}>Position</th>
              </tr>
            </thead>
            <tbody>
              {almostThere.map((r) => (
                <tr key={rowKey(r)}>
                  <td>{rowKey(r)}</td>
                  <td className={styles.num}>{fmtNumber(r.clicks)}</td>
                  <td className={styles.num}>{fmtNumber(r.impressions)}</td>
                  <td className={styles.num}>{pct(r.ctr)}</td>
                  <td className={styles.num}>{fmtPosition(r.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>
            CTR opportunities <span className={styles.badge}>below median CTR</span>
          </h2>
        </div>
        <p className={styles.tableNote}>
          High-impression queries whose CTR is below the median ({pct(medianCtr)}). Each is
          impressions you&apos;re receiving but not converting — usually a title or meta
          description issue.
        </p>
        {ctrOpps.length === 0 ? (
          <p className={styles.muted}>None — all high-impression queries are at or above median CTR.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Query</th>
                <th className={styles.num}>Impr.</th>
                <th className={styles.num}>CTR</th>
                <th className={styles.num}>Position</th>
              </tr>
            </thead>
            <tbody>
              {ctrOpps.map((r) => (
                <tr key={rowKey(r)}>
                  <td>{rowKey(r)}</td>
                  <td className={styles.num}>{fmtNumber(r.impressions)}</td>
                  <td className={styles.num}>{pct(r.ctr)}</td>
                  <td className={styles.num}>{fmtPosition(r.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className={styles.twoCol}>
        <section className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h2>Winners</h2>
          </div>
          <p className={styles.tableNote}>Biggest position improvements vs prior {RANGE_DAYS}d.</p>
          {winners.length === 0 ? (
            <p className={styles.muted}>No movement yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Query</th>
                  <th className={styles.num}>Was</th>
                  <th className={styles.num}>Now</th>
                  <th className={styles.num}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((m) => (
                  <tr key={m.key}>
                    <td>{m.key}</td>
                    <td className={styles.num}>{fmtPosition(m.prevPos)}</td>
                    <td className={styles.num}>{fmtPosition(m.nowPos)}</td>
                    <td className={`${styles.num} ${styles.deltaUp}`}>{m.delta.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h2>Losers</h2>
          </div>
          <p className={styles.tableNote}>Biggest position drops vs prior {RANGE_DAYS}d. Worth investigating.</p>
          {losers.length === 0 ? (
            <p className={styles.muted}>No movement yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Query</th>
                  <th className={styles.num}>Was</th>
                  <th className={styles.num}>Now</th>
                  <th className={styles.num}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {losers.map((m) => (
                  <tr key={m.key}>
                    <td>{m.key}</td>
                    <td className={styles.num}>{fmtPosition(m.prevPos)}</td>
                    <td className={styles.num}>{fmtPosition(m.nowPos)}</td>
                    <td className={`${styles.num} ${styles.deltaDown}`}>+{m.delta.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>
            All queries <span className={styles.badge}>{allSorted.length} rows</span>
          </h2>
        </div>
        <p className={styles.tableNote}>
          Top {allSorted.length} queries by clicks. Google withholds rare queries for user
          privacy — those clicks count in the totals but don&apos;t appear here regardless of
          row limit.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Query</th>
                <th className={styles.num}>Clicks</th>
                <th className={styles.num}>Impr.</th>
                <th className={styles.num}>CTR</th>
                <th className={styles.num}>Position</th>
              </tr>
            </thead>
            <tbody>
              {allSorted.map((r) => (
                <tr key={rowKey(r)}>
                  <td>{rowKey(r)}</td>
                  <td className={styles.num}>{fmtNumber(r.clicks)}</td>
                  <td className={styles.num}>{fmtNumber(r.impressions)}</td>
                  <td className={styles.num}>{pct(r.ctr)}</td>
                  <td className={styles.num}>{fmtPosition(r.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
