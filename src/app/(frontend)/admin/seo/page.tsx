import type { Metadata } from 'next';
import Link from 'next/link';
import { gscQuery, isoDaysAgo, getConnectedEmail, listSites, configuredSiteUrl } from '@/lib/gsc';
import { seoGuard } from './guard';
import { SubNav } from './SubNav';
import styles from './seo.module.css';

export const metadata: Metadata = {
  title: 'Search Console — Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 28;
const GSC_LAG_DAYS = 3;

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}
function fmtNumber(n: number) {
  return n.toLocaleString('en-GB');
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

export default async function SeoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { block } = await seoGuard('/admin/seo');
  if (block) return block;

  const sp = await searchParams;
  const justConnected = sp.gsc_connected === '1';

  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);
  const prevEndDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS + 1);
  const prevStartDate = isoDaysAgo(GSC_LAG_DAYS + 2 * RANGE_DAYS + 1);

  let totals: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let prevTotals: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let topQueries: Awaited<ReturnType<typeof gscQuery>> = [];
  let topPages: Awaited<ReturnType<typeof gscQuery>> = [];
  let errMsg: string | null = null;
  const connectedEmail = await getConnectedEmail();

  try {
    const [t, prev, q, p] = await Promise.all([
      gscQuery({ startDate, endDate, dimensions: [], rowLimit: 1 }),
      gscQuery({ startDate: prevStartDate, endDate: prevEndDate, dimensions: [], rowLimit: 1 }),
      gscQuery({ startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
      gscQuery({ startDate, endDate, dimensions: ['page'], rowLimit: 10 }),
    ]);
    totals = totalsFromRows(t);
    prevTotals = totalsFromRows(prev);
    topQueries = q;
    topPages = p;
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }

  // On error (typically a 403 property mismatch), list the properties this
  // account can actually see so the right GSC_SITE_URL is obvious.
  let accessibleSites: Array<{ siteUrl: string; permissionLevel: string }> | null = null;
  if (errMsg) {
    try {
      accessibleSites = await listSites();
    } catch {
      /* ignore — show the primary error alone */
    }
  }

  return (
    <main className={styles.page}>
      <SubNav active="/admin/seo" />
      <header className={styles.head}>
        <div>
          <h1>Search Console</h1>
          <p className={styles.range}>
            Last {RANGE_DAYS} days &middot; {startDate} → {endDate} &middot; vs prior {RANGE_DAYS}d
          </p>
        </div>
      </header>

      {justConnected && <section className={styles.successBanner}>Connected to Google ✓</section>}

      {errMsg && (
        <section className={styles.error}>
          <h2>Couldn&apos;t load stats</h2>
          <pre>{errMsg}</pre>
          <p>
            <code>GSC_SITE_URL</code> is currently set to{' '}
            <code>{configuredSiteUrl() || '(unset)'}</code>.
          </p>
          {accessibleSites && accessibleSites.length > 0 ? (
            <>
              <p>
                The connected account can access these properties — set{' '}
                <code>GSC_SITE_URL</code> to exactly one of them (then redeploy):
              </p>
              <ul style={{ margin: '0.5rem 0 1rem 1.25rem', lineHeight: 1.8 }}>
                {accessibleSites.map((s) => (
                  <li key={s.siteUrl}>
                    <code>{s.siteUrl}</code>{' '}
                    <span className={styles.deltaFlat}>({s.permissionLevel})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : accessibleSites ? (
            <p>
              This Google account has access to <strong>no</strong> Search Console
              properties. Connect with an account that owns{' '}
              <code>emmerdaleagriculture.com</code>, or add this account as a user in
              Search Console → Settings → Users and permissions.
            </p>
          ) : null}
          <p>
            If the error mentions <code>invalid_grant</code> the refresh token has expired —{' '}
            <Link href="/admin/seo/auth/connect">re-connect</Link>.
          </p>
        </section>
      )}

      <section className={styles.totals}>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Clicks</p>
          <p className={styles.totalValue}>{fmtNumber(totals.clicks)}</p>
          <Delta now={totals.clicks} before={prevTotals.clicks} />
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Impressions</p>
          <p className={styles.totalValue}>{fmtNumber(totals.impressions)}</p>
          <Delta now={totals.impressions} before={prevTotals.impressions} />
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>CTR</p>
          <p className={styles.totalValue}>{pct(totals.ctr)}</p>
          <Delta now={totals.ctr} before={prevTotals.ctr} />
        </div>
        <div className={styles.totalCard}>
          <p className={styles.totalLabel}>Avg position</p>
          <p className={styles.totalValue}>{fmtPosition(totals.position)}</p>
          {/* lower position = better, so invert */}
          <Delta now={totals.position} before={prevTotals.position} invert />
        </div>
      </section>

      <div className={styles.twoCol}>
        {topQueries.length > 0 && (
          <section className={styles.tableSection}>
            <div className={styles.tableHeader}>
              <h2>Top 10 queries</h2>
              <Link href="/admin/seo/queries">All queries →</Link>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Query</th>
                  <th className={styles.num}>Clicks</th>
                  <th className={styles.num}>Pos.</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((row) => (
                  <tr key={row.keys?.join('|')}>
                    <td>{row.keys?.[0] ?? '—'}</td>
                    <td className={styles.num}>{fmtNumber(row.clicks)}</td>
                    <td className={styles.num}>{fmtPosition(row.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {topPages.length > 0 && (
          <section className={styles.tableSection}>
            <div className={styles.tableHeader}>
              <h2>Top 10 pages</h2>
              <Link href="/admin/seo/pages">All pages →</Link>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th className={styles.num}>Clicks</th>
                  <th className={styles.num}>Pos.</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((row) => {
                  const url = row.keys?.[0] ?? '';
                  let display = url;
                  try {
                    display = new URL(url).pathname || url;
                  } catch {
                    /* ignore */
                  }
                  return (
                    <tr key={url}>
                      <td>
                        <a href={url} target="_blank" rel="noopener">
                          {display}
                        </a>
                      </td>
                      <td className={styles.num}>{fmtNumber(row.clicks)}</td>
                      <td className={styles.num}>{fmtPosition(row.position)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {connectedEmail && <p className={styles.connectedAs}>Connected as {connectedEmail}</p>}
    </main>
  );
}
