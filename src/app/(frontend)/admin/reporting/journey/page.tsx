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

  const [clicksQ, depthsQ, stepsQ] = await Promise.all([
    admin
      .from('page_events')
      .select('x_pct, y_pct, label, viewport_w')
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
    admin
      .from('page_events')
      .select('label, session_key, seconds')
      .eq('path', path)
      .eq('kind', 'step')
      .order('created_at', { ascending: false })
      .limit(10000),
  ]);

  const clicks = (clicksQ.data ?? []).filter(
    (c): c is { x_pct: number; y_pct: number; label: string | null; viewport_w: number | null } =>
      c.x_pct !== null && c.y_pct !== null,
  );
  const depths = (depthsQ.data ?? []).filter((d) => d.depth_pct !== null);
  // Visits are distinct tabs, not rows: /start unmounts and remounts the
  // tracker around a failed parse, so one tab can flush twice.
  const visits = new Set(depths.map((d) => d.session_key)).size;

  // The overlay draws on a desktop render of the page. A phone click at x=0.5
  // of a 390px viewport is not at 640px of a 1280px layout — the element it hit
  // may not even be in the same place — so plotting both together would draw a
  // heat map of two different pages.
  const DESKTOP_MIN = 700;
  const desktopClicks = clicks.filter((c) => (c.viewport_w ?? DESKTOP_MIN) >= DESKTOP_MIN);
  const phoneClicks = clicks.length - desktopClicks.length;

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

  // Milestones, as a retention curve through the flow. Each is counted once
  // per visit (the beacon dedupes) and ordered the way the flow runs, so the
  // first big drop is where people stop. Median seconds says how long they
  // spent getting there.
  const MILESTONES: { key: string; label: string }[] = [
    { key: 'typed', label: 'Started typing' },
    { key: 'send', label: 'Pressed Send' },
    { key: 'parsed', label: 'Saw step 2' },
    { key: 'map_drawn', label: 'Drew the field' },
    { key: 'contact', label: 'Started contact details' },
    { key: 'sent', label: 'Sent the job' },
  ];
  const ERRORS: { key: string; label: string }[] = [
    { key: 'parse_error', label: 'Step 1 came back with an error' },
    { key: 'confirm_error', label: 'Step 2 came back with an error' },
  ];
  const steps = stepsQ.data ?? [];
  const stepVisits = new Set(steps.map((r) => r.session_key));
  const allVisits = new Set([...depths.map((d) => d.session_key), ...stepVisits]).size;
  const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  const milestone = (key: string) => {
    const rows = steps.filter((r) => r.label === key);
    return {
      visits: new Set(rows.map((r) => r.session_key)).size,
      seconds: median(rows.map((r) => r.seconds).filter((x): x is number => x !== null)),
    };
  };
  const fmtSecs = (sec: number | null) =>
    sec === null ? '—' : sec < 90 ? `${sec}s` : `${Math.round(sec / 60)}m`;

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
          {path === '/start' && (
            <>
              <div className={s.sectionLabel}>How far through the job people got</div>
              {stepVisits.size === 0 ? (
                <div className={s.empty}>
                  No milestones yet. They are recorded from visits that started after this
                  was added; the first rows appear once those visits end.
                </div>
              ) : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr><th>Milestone</th><th>Visits</th><th>Of all visits</th><th>Of previous</th><th>Median time in</th></tr>
                    </thead>
                    <tbody>
                      {MILESTONES.map((m, i) => {
                        const cur = milestone(m.key);
                        const prev = i === 0 ? allVisits : milestone(MILESTONES[i - 1].key).visits;
                        return (
                          <tr key={m.key}>
                            <td>{m.label}</td>
                            <td>{cur.visits}</td>
                            <td>{allVisits > 0 ? `${Math.round((100 * cur.visits) / allVisits)}%` : '—'}</td>
                            <td>{prev > 0 ? `${Math.round((100 * cur.visits) / prev)}%` : '—'}</td>
                            <td>{fmtSecs(cur.seconds)}</td>
                          </tr>
                        );
                      })}
                      {ERRORS.map((m) => {
                        const cur = milestone(m.key);
                        return cur.visits === 0 ? null : (
                          <tr key={m.key}>
                            <td style={{ color: '#a02a2a' }}>{m.label}</td>
                            <td>{cur.visits}</td>
                            <td>{allVisits > 0 ? `${Math.round((100 * cur.visits) / allVisits)}%` : '—'}</td>
                            <td>—</td>
                            <td>{fmtSecs(cur.seconds)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

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
          <p className={s.metricHint} style={{ marginBottom: 8 }}>
            {desktopClicks.length} desktop click{desktopClicks.length === 1 ? '' : 's'} shown.
            {phoneClicks > 0
              ? ` ${phoneClicks} from narrow screens are left out — they were made on a different layout, so they'd land in the wrong place here.`
              : ''}
          </p>
          <HeatOverlay
            path={path}
            points={desktopClicks.map((c) => ({ x: c.x_pct, y: c.y_pct }))}
          />
        </>
      )}
    </div>
  );
}
