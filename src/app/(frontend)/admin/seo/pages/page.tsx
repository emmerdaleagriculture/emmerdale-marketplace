import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';
import { fetchGa4PageMetrics, isGa4Configured, listGa4Properties } from '@/lib/ga4';
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
function fmtSeconds(s: number) {
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
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
  let ga4Map: Awaited<ReturnType<typeof fetchGa4PageMetrics>> = new Map();
  let ga4Err: string | null = null;
  let errMsg: string | null = null;
  const ga4Configured = isGa4Configured();

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

  // When GA4 isn't wired up yet, list the connected account's properties so the
  // admin can see exactly what to set GA4_PROPERTY_ID to.
  let ga4Properties: Array<{ id: string; name: string; account: string }> | null = null;
  let ga4SetupErr: string | null = null;
  if (ga4Configured) {
    try {
      ga4Map = await fetchGa4PageMetrics(startDate, endDate);
    } catch (err) {
      ga4Err = err instanceof Error ? err.message : String(err);
    }
  } else {
    try {
      ga4Properties = await listGa4Properties();
    } catch (err) {
      ga4SetupErr = err instanceof Error ? err.message : String(err);
    }
  }

  const prevByUrl = new Map(prev.map((r) => [r.keys?.[0] ?? '', r]));
  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
  const showGa4 = ga4Map.size > 0;

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

      {!ga4Configured && (
        <section className={styles.notice}>
          <strong>Add GA4 columns</strong> (sessions, engaged sessions, avg duration).
          {ga4Properties && ga4Properties.length > 0 ? (
            <>
              <p style={{ margin: '0.5rem 0' }}>
                Set <code>GA4_PROPERTY_ID</code> in the environment to one of these
                property ids, then redeploy:
              </p>
              <ul style={{ margin: '0 0 0 1.25rem', lineHeight: 1.8 }}>
                {ga4Properties.map((p) => (
                  <li key={p.id}>
                    <code>{p.id}</code> — {p.name}
                    {p.account ? ` (${p.account})` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : ga4Properties ? (
            <p style={{ margin: '0.5rem 0 0' }}>
              The connected Google account has no GA4 properties. Connect an account
              with GA4 access, or add it as a Viewer in GA4 → Admin → Property Access.
            </p>
          ) : ga4SetupErr && /403|insufficient|scope|permission/i.test(ga4SetupErr) ? (
            <p style={{ margin: '0.5rem 0 0' }}>
              Your connection doesn’t include Analytics access yet —{' '}
              <a href="/admin/seo/auth/connect">re-connect to Google</a> and grant it,
              then reload this page to see your property ids.
            </p>
          ) : (
            <p style={{ margin: '0.5rem 0 0' }}>
              Set <code>GA4_PROPERTY_ID</code> (the numeric id from GA4 → Admin →
              Property settings) in the environment, then redeploy.
            </p>
          )}
        </section>
      )}

      {ga4Configured && ga4Err && (
        <section className={styles.error}>
          <h2>GA4 join failed</h2>
          <pre>{ga4Err}</pre>
          <p>
            Common causes: the connected Google account can&apos;t access GA4 property{' '}
            <code>{process.env.GA4_PROPERTY_ID}</code>, or the token predates the
            Analytics scope — <a href="/admin/seo/auth/connect">re-connect</a> and grant
            Analytics access, or add the account as a Viewer in GA4 admin.
          </p>
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
          clicks. Δ pos shows movement vs prior {RANGE_DAYS}d
          {showGa4 ? '. GA4 columns reflect the same window.' : '.'}
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
                {showGa4 && (
                  <>
                    <th className={styles.num}>Sessions</th>
                    <th className={styles.num}>Engaged</th>
                    <th className={styles.num}>Avg dur</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const url = r.keys?.[0] ?? '';
                const path = pathOf(url);
                const before = prevByUrl.get(url);
                const delta = before ? r.position - before.position : null;
                const ga = ga4Map.get(path);
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
                    {showGa4 && (
                      <>
                        <td className={styles.num}>{ga ? fmtNumber(ga.sessions) : '—'}</td>
                        <td className={styles.num}>{ga ? fmtNumber(ga.engagedSessions) : '—'}</td>
                        <td className={styles.num}>{ga ? fmtSeconds(ga.avgSessionDuration) : '—'}</td>
                      </>
                    )}
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
