import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';
import { seoGuard } from '../guard';
import { SubNav } from '../SubNav';
import styles from '../seo.module.css';

export const metadata: Metadata = {
  title: 'Pages — Admin',
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
function pathOf(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

type Row = GscRow & { keys?: string[] };

export default async function PagesPage() {
  const { block } = await seoGuard('/admin/seo/pages');
  if (block) return block;

  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);
  const prevEnd = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS + 1);
  const prevStart = isoDaysAgo(GSC_LAG_DAYS + 2 * RANGE_DAYS + 1);

  let rows: Row[] = [];
  let prev: Row[] = [];
  let errMsg: string | null = null;

  try {
    const [a, b] = await Promise.all([
      gscQuery({ startDate, endDate, dimensions: ['page'], rowLimit: 200 }),
      gscQuery({ startDate: prevStart, endDate: prevEnd, dimensions: ['page'], rowLimit: 200 }),
    ]);
    rows = a;
    prev = b;
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }

  const prevByUrl = new Map(prev.map((r) => [r.keys?.[0] ?? '', r]));
  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);

  return (
    <main className={styles.page}>
      <SubNav active="/admin/seo/pages" />
      <header className={styles.head}>
        <div>
          <h1>Pages</h1>
          <p className={styles.range}>
            Last {RANGE_DAYS} days &middot; {startDate} → {endDate}
          </p>
        </div>
      </header>

      {errMsg && (
        <section className={styles.error}>
          <h2>Couldn&apos;t load pages</h2>
          <pre>{errMsg}</pre>
        </section>
      )}

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>
            Page health <span className={styles.badge}>{sorted.length} rows</span>
          </h2>
        </div>
        <p className={styles.tableNote}>
          Every URL Google has shown for this site in the last {RANGE_DAYS} days, ordered by
          clicks. Δ pos shows movement vs prior {RANGE_DAYS}d.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Page</th>
                <th className={styles.num}>Clicks</th>
                <th className={styles.num}>Impr.</th>
                <th className={styles.num}>CTR</th>
                <th className={styles.num}>Pos.</th>
                <th className={styles.num}>Δ pos</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const url = r.keys?.[0] ?? '';
                const path = pathOf(url);
                const before = prevByUrl.get(url);
                const delta = before ? r.position - before.position : null;
                return (
                  <tr key={url}>
                    <td>
                      <a href={url} target="_blank" rel="noopener">
                        {path}
                      </a>
                    </td>
                    <td className={styles.num}>{fmtNumber(r.clicks)}</td>
                    <td className={styles.num}>{fmtNumber(r.impressions)}</td>
                    <td className={styles.num}>{pct(r.ctr)}</td>
                    <td className={styles.num}>{fmtPosition(r.position)}</td>
                    <td
                      className={`${styles.num} ${
                        delta == null
                          ? styles.deltaFlat
                          : delta < -0.5
                            ? styles.deltaUp
                            : delta > 0.5
                              ? styles.deltaDown
                              : styles.deltaFlat
                      }`}
                    >
                      {delta == null ? '—' : delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
