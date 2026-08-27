import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import s from '../admin.module.css';

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

  const [viewsQ, subsQ, eventsQ, parsesQ] = await Promise.all([
    admin.from('landing_views').select('created_at, utm_source, utm_campaign, gclid').gte('created_at', cutoff).limit(10000),
    admin
      .from('job_submissions')
      .select(
        'created_at, confirmed_at, status, parse_source, service_confirmed, area_source, photo_paths, utm_source, service:services(name), county:counties(name)',
      )
      .gte('created_at', cutoff)
      .limit(5000),
    admin.from('job_parse_events').select('action, outcome, reason, created_at').gte('created_at', cutoff).limit(10000),
    admin.from('job_submission_parses').select('latency_ms, error, model_version, prompt_version').gte('created_at', cutoff).limit(5000),
  ]);

  const views = (viewsQ.data ?? []) as ViewRow[];
  const subs = (subsQ.data ?? []) as unknown as SubRow[];
  const events = (eventsQ.data ?? []) as EventRow[];
  const parses = (parsesQ.data ?? []) as ParseRow[];
  const viewsMissing = Boolean(viewsQ.error);

  // Part 2 moves status past 'confirmed' (distributed, awarded, …): a
  // confirmed submission is one that reached confirmation, ever.
  const confirmed = subs.filter((r) => r.confirmed_at !== null);
  const window = (days: number) => ({
    views: views.filter((v) => within(v.created_at, days)).length,
    parses: subs.filter((r) => within(r.created_at, days)).length,
    confirms: confirmed.filter((r) => r.confirmed_at && within(r.confirmed_at, days)).length,
  });
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
  for (const v of views) bump(v.utm_source ?? (v.gclid ? 'google (gclid)' : '(direct)'), 'views');
  for (const r of subs) bump(r.utm_source ?? '(direct)', 'parses');
  for (const r of confirmed) bump(r.utm_source ?? '(direct)', 'confirms');

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
        <Link href="/admin/submissions">Submissions queue →</Link>
      </p>

      {viewsMissing && (
        <div className={s.empty}>
          View tracking isn&rsquo;t live yet — the landing_views migration
          hasn&rsquo;t been applied. Parse and confirm numbers below are real.
        </div>
      )}

      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Landings (30d)</div>
          <div className={s.metricValue}>{d30.views}</div>
          <div className={s.metricHint}>{d7.views} in 7d · {d1.views} in 24h</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Parses started (30d)</div>
          <div className={s.metricValue}>{d30.parses}</div>
          <div className={s.metricHint}>{pct(d30.parses, d30.views)} of landings</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Jobs confirmed (30d)</div>
          <div className={s.metricValue}>{d30.confirms}</div>
          <div className={s.metricHint}>{pct(d30.confirms, d30.parses)} of parses</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Landing → job</div>
          <div className={s.metricValue}>{pct(d30.confirms, d30.views)}</div>
          <div className={s.metricHint}>the number ads are buying</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Daily — last 14 days</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Day</th><th>Landings</th><th>Parses</th><th>Confirmed</th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.views || '—'}</td>
                <td>{d.parses || '—'}</td>
                <td>{d.confirms || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.sectionLabel}>Attribution — last 30 days</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Source</th><th>Landings</th><th>Parses</th><th>Confirmed</th><th>Landing → job</th></tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
      </div>

      <div className={s.sectionLabel}>Parse pipeline — last 30 days</div>
      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Parse latency</div>
          <div className={s.metricValue}>{avgLatency !== null ? `${(avgLatency / 1000).toFixed(1)}s` : '—'}</div>
          <div className={s.metricHint}>{p95Latency !== null ? `p95 ${(p95Latency / 1000).toFixed(1)}s` : 'no data'}</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Fallback parses</div>
          <div className={s.metricValue}>{subs.filter((r) => r.parse_source === 'deterministic_fallback').length}</div>
          <div className={s.metricHint}>LLM unavailable or timed out</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Unmatched services</div>
          <div className={s.metricValue}>{unmatchedCount}</div>
          <div className={s.metricHint}>of {confirmed.length} confirmed — taxonomy gaps</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Reclassified by customer</div>
          <div className={s.metricValue}>{declinedCount}</div>
          <div className={s.metricHint}>said &ldquo;not quite&rdquo; — prompt feedback</div>
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Parse outcome</th><th>Count</th></tr>
          </thead>
          <tbody>
            {outcomes.map(([label, count]) => (
              <tr key={label}><td>{label}</td><td>{count}</td></tr>
            ))}
            {versions.map(([label, count]) => (
              <tr key={label}><td>model {label}</td><td>{count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.sectionLabel}>Confirmed jobs — last 30 days</div>
      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Boundary drawn</div>
          <div className={s.metricValue}>{pct(boundaryCount, confirmed.length)}</div>
          <div className={s.metricHint}>{boundaryCount} of {confirmed.length}</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>With photos</div>
          <div className={s.metricValue}>{pct(photoCount, confirmed.length)}</div>
          <div className={s.metricHint}>{photoCount} of {confirmed.length}</div>
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Service</th><th>Confirmed</th></tr>
          </thead>
          <tbody>
            {byService.map(([name, count]) => (
              <tr key={name}><td>{name}</td><td>{count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>County</th><th>Confirmed</th></tr>
          </thead>
          <tbody>
            {byCounty.map(([name, count]) => (
              <tr key={name}><td>{name}</td><td>{count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
