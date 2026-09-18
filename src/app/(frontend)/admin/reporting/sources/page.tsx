import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { channelOf, compareChannels, isPaid, UNATTRIBUTED } from '@/lib/attribution';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Sources — Admin' };
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');

type ViewRow = { created_at: string; utm_source: string | null; gclid: string | null; referrer: string | null };
type SubRow = {
  created_at: string;
  confirmed_at: string | null;
  status: string;
  utm_source: string | null;
  gclid: string | null;
};

/**
 * Where the work comes from, and what each source is actually worth.
 *
 * A confirmed job is the conversion both ad platforms count: each is configured
 * against the /start/complete URL, and reaching that page is precisely what
 * confirming a submission does. So "Jobs confirmed" here is not an approximation
 * of what Ads and Meta report — it is the same event, counted from our side.
 *
 * The landing-funnel page answers "where do people drop out". This one answers
 * "which source is worth buying", which is a different question and wants the
 * channels side by side rather than one funnel summed over all of them.
 */
export default async function SourcesPage() {
  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();

  const [viewsQ, subsQ] = await Promise.all([
    admin.from('landing_views').select('created_at, utm_source, gclid, referrer').gte('created_at', cutoff).limit(10000),
    admin
      .from('job_submissions')
      .select('created_at, confirmed_at, status, utm_source, gclid')
      .gte('created_at', cutoff)
      .limit(5000),
  ]);

  const views = (viewsQ.data ?? []) as ViewRow[];
  const subs = (subsQ.data ?? []) as SubRow[];
  const viewsMissing = Boolean(viewsQ.error);

  // Earliest view we hold — the rate denominators mean nothing before it, and
  // saying so beats letting someone compare against a longer, older window.
  const firstView = views.reduce<string | null>(
    (min, v) => (min === null || v.created_at < min ? v.created_at : min),
    null,
  );

  type Row = { channel: string; arrivals: number; started: number; confirmed: number; drafts: number };
  const rows = new Map<string, Row>();
  const row = (channel: string): Row => {
    const existing = rows.get(channel);
    if (existing) return existing;
    const made = { channel, arrivals: 0, started: 0, confirmed: 0, drafts: 0 };
    rows.set(channel, made);
    return made;
  };

  for (const v of views) row(channelOf(v)).arrivals += 1;
  for (const r of subs) {
    const target = row(channelOf(r));
    target.started += 1;
    if (r.confirmed_at) target.confirmed += 1;
    if (r.status === 'draft') target.drafts += 1;
  }

  const channels = [...rows.values()].sort(
    (a, b) => compareChannels(a.channel, b.channel) || b.arrivals - a.arrivals,
  );

  const totals = channels.reduce(
    (acc, c) => ({
      arrivals: acc.arrivals + c.arrivals,
      started: acc.started + c.started,
      confirmed: acc.confirmed + c.confirmed,
      drafts: acc.drafts + c.drafts,
    }),
    { arrivals: 0, started: 0, confirmed: 0, drafts: 0 },
  );

  const paid = channels.filter((c) => isPaid(c.channel));
  const paidTotals = paid.reduce(
    (acc, c) => ({ arrivals: acc.arrivals + c.arrivals, confirmed: acc.confirmed + c.confirmed }),
    { arrivals: 0, confirmed: 0 },
  );

  // Referrers say what "unattributed" actually is — syndicatedsearch.goog is
  // Google's search-partner network, so some of it is paid traffic whose gclid
  // didn't survive the hop.
  const referrers = new Map<string, number>();
  for (const v of views) {
    const key = v.referrer?.trim() ? v.referrer.replace(/^https?:\/\//, '').replace(/\/$/, '') : '(none — direct)';
    referrers.set(key, (referrers.get(key) ?? 0) + 1);
  }
  const topReferrers = [...referrers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Last 14 days, paid against everything else.
  const days: { day: string; paid: number; other: number; confirmed: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const dayViews = views.filter((v) => v.created_at.slice(0, 10) === key);
    days.push({
      day: key,
      paid: dayViews.filter((v) => isPaid(channelOf(v))).length,
      other: dayViews.filter((v) => !isPaid(channelOf(v))).length,
      confirmed: subs.filter((r) => r.confirmed_at?.slice(0, 10) === key).length,
    });
  }

  return (
    <div>
      <h1 className={s.h1}>Sources</h1>
      <p className={s.sub}>
        Where arrivals and jobs come from, last 30 days. A <strong>confirmed job</strong> is the
        conversion Google Ads and Meta both count — each is configured against the{' '}
        <code>/start/complete</code> URL, and confirming a submission is what loads it.{' '}
        <Link href="/admin/reporting">Landing funnel →</Link>{' '}
        <Link href="/admin/reporting/journey">Clicks &amp; scroll depth →</Link>
      </p>

      {viewsMissing && (
        <div className={s.empty}>
          Arrival tracking isn&rsquo;t readable — the landing_views table didn&rsquo;t
          return. Submission and confirm numbers below are still real; the rates are not.
        </div>
      )}
      {!viewsMissing && firstView && (
        <div className={s.empty}>
          Arrivals are only recorded from <strong>{firstView.slice(0, 10)}</strong>. Anything
          submitted before then has no arrival to divide by, so treat the earliest rates as
          understated rather than as a collapse in performance.
        </div>
      )}

      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Arrivals (30d)</div>
          <div className={s.metricValue}>{totals.arrivals}</div>
          <div className={s.metricHint}>{paidTotals.arrivals} from paid</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Jobs started</div>
          <div className={s.metricValue}>{totals.started}</div>
          <div className={s.metricHint}>{pct(totals.started, totals.arrivals)} of arrivals</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Jobs confirmed</div>
          <div className={s.metricValue}>{totals.confirmed}</div>
          <div className={s.metricHint}>what the ad platforms count</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Confirmed from paid</div>
          <div className={s.metricValue}>{paidTotals.confirmed}</div>
          <div className={s.metricHint}>
            {pct(paidTotals.confirmed, paidTotals.arrivals)} of {paidTotals.arrivals} paid arrivals
          </div>
        </div>
      </div>

      <div className={s.sectionLabel}>By source — last 30 days</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Arrivals</th>
              <th>Started</th>
              <th>Still draft</th>
              <th>Confirmed</th>
              <th>Arrival → job</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const share = totals.arrivals > 0 ? (100 * c.arrivals) / totals.arrivals : 0;
              return (
                <tr key={c.channel}>
                  <td>
                    {c.channel}
                    {isPaid(c.channel) && <div className={s.metricHint}>paid</div>}
                    {c.channel === UNATTRIBUTED && (
                      <div className={s.metricHint}>includes paid clicks with no gclid</div>
                    )}
                  </td>
                  <td>{c.arrivals || '—'}</td>
                  <td>{c.started || '—'}</td>
                  <td>{c.drafts || '—'}</td>
                  <td>{c.confirmed || '—'}</td>
                  <td>{c.arrivals > 0 ? pct(c.confirmed, c.arrivals) : '—'}</td>
                  <td style={{ width: '20%' }}>
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

      <div className={s.sectionLabel}>What &ldquo;unattributed&rdquo; is — top referrers</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Referrer</th><th>Arrivals</th></tr>
          </thead>
          <tbody>
            {topReferrers.map(([ref, n]) => (
              <tr key={ref}>
                <td>
                  {ref}
                  {ref.includes('syndicatedsearch.goog') && (
                    <div className={s.metricHint}>Google search-partner network — paid</div>
                  )}
                </td>
                <td>{n}</td>
              </tr>
            ))}
            {topReferrers.length === 0 && (
              <tr><td colSpan={2}>No arrivals recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={s.sectionLabel}>Daily — last 14 days</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Day</th><th>Paid arrivals</th><th>Everything else</th><th>Confirmed</th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.paid || '—'}</td>
                <td>{d.other || '—'}</td>
                <td>{d.confirmed || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
