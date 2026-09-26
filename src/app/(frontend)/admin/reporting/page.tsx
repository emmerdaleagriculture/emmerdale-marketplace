import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { channelOf } from '@/lib/attribution';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles } from '../ui';

export const metadata: Metadata = { title: 'Reporting — Admin' };

/**
 * Landing-page funnel reporting (spec §30, the Part 1 slice): first-party
 * view → parse → confirm numbers with the quality stats around them. Views
 * come from the landing_views beacon; everything else is already recorded by
 * the parse pipeline. All aggregation happens here in TS — at this volume a
 * few hundred rows beat maintaining SQL rollups.
 */

const DAY = 24 * 60 * 60 * 1000;

type ViewRow = { created_at: string; utm_source: string | null; utm_campaign: string | null; gclid: string | null };
type SubRow = {
  created_at: string;
  confirmed_at: string | null;
  status: string;
  parse_source: string | null;
  service_confirmed: boolean | null;
  area_source: string;
  photo_paths: string[];
  utm_source: string | null;
  /** Needed to tell an Ads job from a direct one — see @/lib/attribution. */
  gclid: string | null;
  service: { name: string } | null;
  county: { name: string } | null;
};
type EventRow = { action: string; outcome: string; reason: string | null; created_at: string };
type ParseRow = { latency_ms: number | null; error: string | null; model_version: string | null; prompt_version: string | null };

const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const within = (iso: string, days: number) => Date.now() - new Date(iso).getTime() <= days * DAY;
const pct = (num: number, den: number) => (den > 0 ? `${((100 * num) / den).toFixed(1)}%` : '—');

function tally<T>(rows: T[], key: (r: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function ReportingPage() {
  const admin = createServiceRoleClient();
  const cutoff = since(30);

  // Paged (see fetchAll): the API returns 1000 rows per call at most.
  const [viewsQ, subsQ, eventsQ, parsesQ] = await Promise.all([
    fetchAll((from, to) => admin.from('landing_views').select('created_at, utm_source, utm_campaign, gclid').gte('created_at', cutoff).order('created_at').order('id').range(from, to), { max: 10000 })
      .then((data) => ({ data, error: null as Error | null }), (error: Error) => ({ data: [], error })),
    fetchAll((from, to) => admin
      .from('job_submissions')
      .select(
        'created_at, confirmed_at, status, parse_source, service_confirmed, area_source, photo_paths, utm_source, gclid, service:services(name), county:counties(name)',
      )
      .gte('created_at', cutoff)
      .order('created_at').order('id')
      .range(from, to), { max: 5000 }),
    fetchAll((from, to) => admin.from('job_parse_events').select('action, outcome, reason, created_at').gte('created_at', cutoff).order('created_at').order('id').range(from, to), { max: 10000 }),
    fetchAll((from, to) => admin.from('job_submission_parses').select('latency_ms, error, model_version, prompt_version').gte('created_at', cutoff).order('created_at').order('id').range(from, to), { max: 5000 }),
  ]);

  const views = viewsQ.data as ViewRow[];
  const subs = subsQ as unknown as SubRow[];
  const events = eventsQ as EventRow[];
  const parses = parsesQ as ParseRow[];
  const viewsMissing = Boolean(viewsQ.error);

  // Part 2 moves status past 'confirmed' (distributed, awarded, …): a
  // confirmed submission is one that reached confirmation, ever.
  const confirmed = subs.filter((r) => r.confirmed_at !== null);
  const window = (days: number) => ({
    views: views.filter((v) => within(v.created_at, days)).length,
    parses: subs.filter((r) => within(r.created_at, days)).length,
    confirms: confirmed.filter((r) => r.confirmed_at && within(r.confirmed_at, days)).length,
  });
  // The whole funnel, not just the landing slice: a submission that reached
  // 'awarded' also passed every step before it, so each stage counts everything
  // at or beyond it. Statuses that leave the ladder — no_matches, no_quotes,
  // expired — are counted separately below, because a job that stops there
  // stopped for a reason worth naming rather than being an anonymous gap.
  const AFTER_CONFIRM = new Set([
    'confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment',
    'awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor',
    'completed', 'paid', 'no_matches', 'no_quotes', 'expired', 'cancelled',
    'variation_pending', 'variation_declined', 'disputed',
  ]);
  const AFTER_DISTRIBUTE = new Set([
    'distributed', 'quotes_receiving', 'accepted_awaiting_payment', 'awarded',
    'contacted', 'scheduled', 'in_progress', 'completed_by_contractor', 'completed',
    'paid', 'no_quotes', 'expired', 'variation_pending', 'variation_declined',
    'disputed',
  ]);
  const AFTER_QUOTE = new Set([
    'quotes_receiving', 'accepted_awaiting_payment', 'awarded', 'contacted',
    'scheduled', 'in_progress', 'completed_by_contractor', 'completed', 'paid',
    'expired', 'variation_pending', 'variation_declined', 'disputed',
  ]);
  const AFTER_ACCEPT = new Set([
    'accepted_awaiting_payment', 'awarded', 'contacted', 'scheduled', 'in_progress',
    'completed_by_contractor', 'completed', 'paid', 'variation_pending',
    'variation_declined', 'disputed',
  ]);
  const AFTER_PAY = new Set([
    'awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor',
    'completed', 'paid', 'variation_pending', 'variation_declined', 'disputed',
  ]);
  const DONE = new Set(['completed', 'paid']);
  const reached = (set: Set<string>) => subs.filter((r) => set.has(r.status)).length;

  const funnel = [
    { step: 'Landed on /start', n: views.length, note: 'the beacon on first render' },
    { step: 'Started a description', n: subs.length, note: 'a draft was created' },
    { step: 'Confirmed the job', n: reached(AFTER_CONFIRM), note: 'contact details given' },
    { step: 'Went out to contractors', n: reached(AFTER_DISTRIBUTE), note: 'at least one invitation sent' },
    { step: 'Got a price', n: reached(AFTER_QUOTE), note: 'at least one confirmed quote' },
    { step: 'Accepted one', n: reached(AFTER_ACCEPT), note: 'chose a price' },
    { step: 'Booked', n: reached(AFTER_PAY), note: 'deposit cleared, contractor awarded' },
    { step: 'Finished', n: reached(DONE), note: 'work confirmed complete' },
  ];

  const LEAKS: [string, string][] = [
    ['abandoned', 'Started, never confirmed'],
    ['draft', 'Still a draft'],
    ['no_matches', 'No contractor covered the county'],
    ['no_quotes', 'Went out, nobody priced it'],
    ['expired', 'Ran out of time'],
    ['cancelled', 'Cancelled'],
  ];
  const leaks = LEAKS.map(([status, label]) => ({
    label,
    status,
    n: subs.filter((r) => r.status === status).length,
  })).filter((l) => l.n > 0);

  const d1 = window(1);
  const d7 = window(7);
  const d30 = window(30);

  // Parse pipeline outcomes (events, action=parse).
  const parseEvents = events.filter((e) => e.action === 'parse');
  const outcomes = tally(parseEvents, (e) => (e.outcome === 'ok' ? 'ok' : `${e.outcome}${e.reason ? `: ${e.reason}` : ''}`));

  const latencies = parses.filter((p) => p.latency_ms !== null && !p.error).map((p) => p.latency_ms!) .sort((a, b) => a - b);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const p95Latency = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null;
  const versions = tally(
    parses.filter((p) => p.model_version),
    (p) => `${p.model_version} / ${p.prompt_version ?? '—'}`,
  );

  // Confirmed-job quality.
  const unmatchedCount = confirmed.filter((r) => !r.service).length;
  const declinedCount = confirmed.filter((r) => r.service_confirmed === false).length;
  const boundaryCount = confirmed.filter((r) => r.area_source !== 'stated').length;
  const photoCount = confirmed.filter((r) => (r.photo_paths ?? []).length > 0).length;
  const byService = tally(confirmed, (r) => r.service?.name ?? '(unmatched)');
  const byCounty = tally(confirmed, (r) => r.county?.name ?? '(unresolved)');

  // Attribution: views vs submissions vs confirms per utm_source.
  const sources = new Map<string, { views: number; parses: number; confirms: number }>();
  const bump = (key: string, field: 'views' | 'parses' | 'confirms') => {
    const row = sources.get(key) ?? { views: 0, parses: 0, confirms: 0 };
    row[field] += 1;
    sources.set(key, row);
  };
  // One classifier for all three rows (@/lib/attribution). The gclid fallback
  // used to apply to views only — and `subs` didn't even select the column —
  // so every Ads submission and confirm landed in "(direct)", and the one
  // channel that costs money read as producing nothing.
  for (const v of views) bump(channelOf(v), 'views');
  for (const r of subs) bump(channelOf(r), 'parses');
  for (const r of confirmed) bump(channelOf(r), 'confirms');

  // Daily rollup, last 14 days.
  const days: { day: string; views: number; parses: number; confirms: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY);
    const key = date.toISOString().slice(0, 10);
    days.push({
      day: key,
      views: views.filter((v) => v.created_at.slice(0, 10) === key).length,
      parses: subs.filter((r) => r.created_at.slice(0, 10) === key).length,
      confirms: confirmed.filter((r) => r.confirmed_at?.slice(0, 10) === key).length,
    });
  }

  return (
    <div>
      <h1 className={s.h1}>Landing page reporting</h1>
      <p className={s.sub}>
        The /start funnel: views → parses → confirmed jobs, last 30 days.{' '}
        <Link href="/admin/reporting/journey">Clicks &amp; scroll depth →</Link>{' '}
        <Link href="/admin/submissions">Submissions queue →</Link>
      </p>

      {viewsMissing && (
        <div className={s.empty}>
          View tracking isn&rsquo;t live yet — the landing_views migration
          hasn&rsquo;t been applied. Parse and confirm numbers below are real.
        </div>
      )}

      <Tiles>
        <Tile value={d30.views} label="Landings (30d)" hint={<>{d7.views} in 7d · {d1.views} in 24h</>} />
        <Tile value={d30.parses} label="Parses started (30d)" hint={<>{pct(d30.parses, d30.views)} of landings</>} />
        <Tile value={d30.confirms} label="Jobs confirmed (30d)" hint={<>{pct(d30.confirms, d30.parses)} of parses</>} />
        <Tile value={pct(d30.confirms, d30.views)} label="Landing → job" hint="the number ads are buying" />
      </Tiles>

      <div className={s.sectionLabel}>Where people are lost — last 30 days</div>
      {(viewsMissing || funnel[1].n > funnel[0].n) && (
        <div className={s.empty}>
          More jobs than landings recorded, so the first step is under-counting —
          the view beacon is blocked, failing, or these jobs arrived before it was
          live. Steps below it are still sound; the landing→job rate is not.
        </div>
      )}
      <AdminTable head={['Step', 'Reached', 'Of the step before', 'Lost here', '']}>
        {funnel.map((row, i) => {
          const prev = i === 0 ? null : funnel[i - 1].n;
          const lost = prev === null ? null : prev - row.n;
          const share = funnel[0].n > 0 ? (100 * row.n) / funnel[0].n : 0;
          return (
            <tr key={row.step}>
              <td>{row.step}<div className={s.metricHint}>{row.note}</div></td>
              <td>{row.n}</td>
              <td>{prev === null ? '—' : pct(row.n, prev)}</td>
              <td>
                {lost === null ? '—' : lost > 0 ? `−${lost}` : lost < 0 ? '?' : '0'}
              </td>
              <td style={{ width: '30%' }}>
                <span style={{ display: 'block', height: 8, width: `${share}%`,
                  background: 'var(--jd-green-deep)', minWidth: share > 0 ? 2 : 0 }} />
              </td>
            </tr>
          );
        })}
      </AdminTable>

      {leaks.length > 0 && (
        <>
          <div className={s.sectionLabel}>Why they stopped</div>
          <AdminTable head={['Reason', 'Jobs', 'Status']}>
            {leaks.map((l) => (
              <tr key={l.status}>
                <td>{l.label}</td>
                <td>{l.n}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}

      <div className={s.sectionLabel}>Daily — last 14 days</div>
      <AdminTable head={['Day', 'Landings', 'Parses', 'Confirmed']}>
        {days.map((d) => (
          <tr key={d.day}>
            <td>{d.day}</td>
            <td>{d.views || '—'}</td>
            <td>{d.parses || '—'}</td>
            <td>{d.confirms || '—'}</td>
          </tr>
        ))}
      </AdminTable>

      <div className={s.sectionLabel}>Attribution — last 30 days</div>
      <AdminTable head={['Source', 'Landings', 'Parses', 'Confirmed', 'Landing → job']}>
        {[...sources.entries()]
          .sort((a, b) => b[1].views + b[1].parses - (a[1].views + a[1].parses))
          .map(([source, row]) => (
            <tr key={source}>
              <td>{source}</td>
              <td>{row.views}</td>
              <td>{row.parses}</td>
              <td>{row.confirms}</td>
              <td>{pct(row.confirms, row.views)}</td>
            </tr>
          ))}
      </AdminTable>

      <div className={s.sectionLabel}>Parse pipeline — last 30 days</div>
      <Tiles>
        <div className={s.metric}>
          {/* Empty by design, for the same reason as the fallback count: no
              model call, no latency to record. */}
          <div className={s.metricLabel}>Parse latency (model)</div>
          <div className={s.metricValue}>{avgLatency !== null ? `${(avgLatency / 1000).toFixed(1)}s` : '—'}</div>
          <div className={s.metricHint}>{p95Latency !== null ? `p95 ${(p95Latency / 1000).toFixed(1)}s` : 'no data'}</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Fallback parses</div>
          <div className={s.metricValue}>{subs.filter((r) => r.parse_source === 'deterministic_fallback').length}</div>
          {/* Not a failure count. The model came out of job creation in
              8e86e71 — routing is by county alone, so nothing downstream reads
              the wording — which means every parse is deterministic now and
              this number should equal the total. Reading it as "the LLM is
              down" sends people chasing a bug that was a deliberate decision. */}
          <div className={s.metricHint}>expected — no model in job creation since 8e86e71</div>
        </div>
        <Tile value={unmatchedCount} label="Unmatched services" hint={<>of {confirmed.length} confirmed — taxonomy gaps</>} />
        <Tile value={declinedCount} label="Reclassified by customer" hint="said &ldquo;not quite&rdquo; — prompt feedback" />
      </Tiles>
      <AdminTable head={['Parse outcome', 'Count']}>
        {outcomes.map(([label, count]) => (
          <tr key={label}><td>{label}</td><td>{count}</td></tr>
        ))}
        {versions.map(([label, count]) => (
          <tr key={label}><td>model {label}</td><td>{count}</td></tr>
        ))}
      </AdminTable>

      <div className={s.sectionLabel}>Confirmed jobs — last 30 days</div>
      <Tiles>
        <Tile value={pct(boundaryCount, confirmed.length)} label="Boundary drawn" hint={<>{boundaryCount} of {confirmed.length}</>} />
        <Tile value={pct(photoCount, confirmed.length)} label="With photos" hint={<>{photoCount} of {confirmed.length}</>} />
      </Tiles>
      <AdminTable head={['Service', 'Confirmed']}>
        {byService.map(([name, count]) => (
          <tr key={name}><td>{name}</td><td>{count}</td></tr>
        ))}
      </AdminTable>
      <AdminTable head={['County', 'Confirmed']}>
        {byCounty.map(([name, count]) => (
          <tr key={name}><td>{name}</td><td>{count}</td></tr>
        ))}
      </AdminTable>
    </div>
  );
}
