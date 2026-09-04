import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { HeatOverlay } from './HeatOverlay';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Journey — Admin' };
export const dynamic = 'force-dynamic';

const PATHS = [
  { path: '/', label: 'Home' },
  { path: '/start', label: 'Job creation' },
];

/**
 * How people move through a page, as opposed to whether they arrived: clicks
 * drawn over the live page, and how far down anyone actually got.
 *
 * Aggregated per visit, not per person. A "visit" is one tab's random session
 * key, which means nothing outside that tab — there is no identity here to
 * follow, by design.
 */
export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const sp = await searchParams;
  const path = PATHS.some((p) => p.path === sp.path) ? sp.path! : '/';
  const admin = createServiceRoleClient();

  const [clicksQ, depthsQ] = await Promise.all([
    admin
      .from('page_events')
      .select('x_pct, y_pct, label')
      .eq('path', path)
      .eq('kind', 'click')
      .order('created_at', { ascending: false })
      .limit(3000),
    admin
      .from('page_events')
      .select('depth_pct, session_key, viewport_w')
      .eq('path', path)
      .eq('kind', 'depth')
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const clicks = (clicksQ.data ?? []).filter(
    (c): c is { x_pct: number; y_pct: number; label: string | null } =>
      c.x_pct !== null && c.y_pct !== null,
  );
  const depths = (depthsQ.data ?? []).filter((d) => d.depth_pct !== null);
  const visits = depths.length;

  // How many visits reached at least this far — a retention curve down the
  // page. The last band that holds up is where the page stops earning
  // attention.
  const bands = [10, 25, 50, 75, 90, 100].map((mark) => ({
    mark,
    reached: depths.filter((d) => (d.depth_pct ?? 0) >= mark).length,
  }));

  const byLabel = new Map<string, number>();
  for (const c of clicks) {
    const key = c.label?.trim() || '(no label)';
    byLabel.set(key, (byLabel.get(key) ?? 0) + 1);
  }
  const topLabels = [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const phones = depths.filter((d) => (d.viewport_w ?? 0) > 0 && (d.viewport_w ?? 0) < 700).length;

  return (
    <div>
      <h1 className={s.h1}>Journey</h1>
      <p className={s.sub}>
        Where people click and how far they scroll. Aggregated per visit — a visit is
        one browser tab, and nothing here identifies anyone.{' '}
        <Link href="/admin/reporting">Funnel numbers are next door.</Link>
      </p>

      <div className={s.sectionLabel}>Page</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <tbody>
            <tr>
              {PATHS.map((p) => (
                <td key={p.path}>
                  {p.path === path ? (
                    <strong>{p.label}</strong>
                  ) : (
                    <Link href={`/admin/reporting/journey?path=${encodeURIComponent(p.path)}`}>
                      {p.label}
                    </Link>
                  )}
                </td>
              ))}
              <td>
                {visits} visit{visits === 1 ? '' : 's'} · {clicks.length} clicks ·{' '}
                {visits > 0 ? Math.round((100 * phones) / visits) : 0}% on a phone
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {visits === 0 ? (
        <div className={s.empty}>
          Nothing recorded for this page yet. The beacon sends when a tab is hidden or
          closed, so the first numbers appear after real visits end — not while you are
          looking at the page yourself.
        </div>
      ) : (
        <>
          <div className={s.sectionLabel}>How far down people got</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Reached</th><th>Visits</th><th>Share</th><th /></tr>
              </thead>
              <tbody>
                {bands.map((b) => {
                  const share = visits > 0 ? (100 * b.reached) / visits : 0;
                  return (
                    <tr key={b.mark}>
                      <td>{b.mark}% down the page</td>
                      <td>{b.reached}</td>
                      <td>{share.toFixed(0)}%</td>
                      <td style={{ width: '45%' }}>
                        <span
                          style={{
                            display: 'block',
                            height: 8,
                            width: `${share}%`,
                            background: 'var(--jd-green-deep)',
                            minWidth: share > 0 ? 2 : 0,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={s.sectionLabel}>Most clicked</div>
          {topLabels.length === 0 ? (
            <div className={s.empty}>No clicks recorded yet.</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr><th>What was clicked</th><th>Clicks</th><th>Per visit</th></tr>
                </thead>
                <tbody>
                  {topLabels.map(([label, n]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{n}</td>
                      <td>{(n / visits).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={s.sectionLabel}>Click heat, over the live page</div>
          <p className={s.sub} style={{ marginTop: -8 }}>
            The page as it is now, not a screenshot — so if the layout has changed since
            these clicks, they sit where the old layout put them.
          </p>
          <HeatOverlay path={path} points={clicks.map((c) => ({ x: c.x_pct, y: c.y_pct }))} />
        </>
      )}
    </div>
  );
}
