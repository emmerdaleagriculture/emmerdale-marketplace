import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { HTTP_CRONS, isLate } from '@/lib/cron/registry';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Scheduled jobs — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Everything that runs on a timer, and whether it still is.
 *
 * Ten jobs run this business unattended and nothing listed them. Eight are
 * pg_cron and keep a full history in a schema the app could not read; two are
 * Vercel Cron hitting /api/cron/*, and those left no trace at all — the only
 * evidence /api/cron/balances had ever fired was money moving.
 *
 * The distinction this page exists to draw is between a job that ran and did
 * nothing, and a job that did not run. Those are identical in every other
 * view — a quiet week and a stopped scheduler both look like an empty table —
 * and they are the difference between "no balances were due" and "nobody has
 * been charged since Tuesday".
 */

const fmtWhen = (iso: string | null) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const fmtRan = (started: string, finished: string | null) => {
  if (!finished) return '—';
  const ms = Date.parse(finished) - Date.parse(started);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

type Verdict = { label: string; bad: boolean };

export default async function CronsPage() {
  const admin = createServiceRoleClient();

  const [pgQ, runsQ] = await Promise.all([
    admin.rpc('cron_jobs_health'),
    // Enough to show the last few of each without a query per job.
    admin
      .from('cron_runs')
      .select('name, started_at, finished_at, ok, detail, error')
      .order('started_at', { ascending: false })
      .limit(200),
  ]);

  // Same rule as /admin/errors: a failed read must not render as an all-clear.
  // This page's empty state means "nothing is scheduled", which would be the
  // most alarming possible lie.
  if (pgQ.error) throw new Error(`Could not read pg_cron: ${pgQ.error.message}`);
  if (runsQ.error) throw new Error(`Could not read cron_runs: ${runsQ.error.message}`);

  const runs = runsQ.data ?? [];
  const byName = new Map<string, typeof runs>();
  for (const r of runs) {
    const list = byName.get(r.name) ?? [];
    list.push(r);
    byName.set(r.name, list);
  }

  const httpRows = HTTP_CRONS.map((job) => {
    const mine = byName.get(job.name) ?? [];
    const last = mine[0] ?? null;
    const failures = mine.filter((r) => r.ok === false).length;
    const verdict: Verdict = !last
      ? {
          label: 'never seen — check it is registered in Vercel',
          bad: true,
        }
      : last.ok === false
        ? { label: 'last run failed', bad: true }
        : last.finished_at === null
          ? { label: 'started and never finished', bad: true }
          : isLate(job, last.started_at)
            ? { label: `no run for ${fmtWhen(last.started_at)}`, bad: true }
            : { label: 'running to schedule', bad: false };
    return { job, last, failures, seen: mine.length, verdict };
  });

  const pgRows = (pgQ.data ?? []) as {
    jobname: string;
    schedule: string;
    command: string;
    active: boolean;
    last_status: string | null;
    last_start: string | null;
    last_end: string | null;
    last_message: string | null;
    runs_24h: number;
    failures_24h: number;
  }[];

  const unhealthy =
    httpRows.filter((r) => r.verdict.bad).length +
    pgRows.filter((j) => !j.active || j.failures_24h > 0 || !j.last_start).length;

  return (
    <div>
      <h1 className={s.h1}>Scheduled jobs</h1>
      <p className={s.sub}>
        Everything that runs on a timer. The question this page answers is not
        &ldquo;did anything happen&rdquo; but &ldquo;did it run&rdquo; — a job that fired
        and found nothing to do and a job that never fired look the same everywhere
        else, and only one of them is fine.
      </p>

      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Scheduled</div>
          <div className={s.metricValue}>{HTTP_CRONS.length + pgRows.length}</div>
          <div className={s.metricHint}>
            {HTTP_CRONS.length} on Vercel, {pgRows.length} in Postgres
          </div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Needing a look</div>
          <div className={s.metricValue}>{unhealthy}</div>
          <div className={s.metricHint}>late, failing, or never seen</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Runs recorded</div>
          <div className={s.metricValue}>{runs.length}</div>
          <div className={s.metricHint}>HTTP crons, last 200</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Vercel Cron — the app&rsquo;s own endpoints</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Last run</th>
              <th>Took</th>
              <th>Result</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {httpRows.map(({ job, last, verdict, failures }) => (
              <tr key={job.name}>
                <td>
                  <code>{job.path}</code>
                  <div className={s.metricHint}>{job.what}</div>
                </td>
                <td>
                  <code>{job.schedule}</code>
                </td>
                <td>{fmtWhen(last?.started_at ?? null)}</td>
                <td>{last ? fmtRan(last.started_at, last.finished_at) : '—'}</td>
                <td>
                  {last?.error ? (
                    <span>{last.error}</span>
                  ) : last?.detail ? (
                    <code>{JSON.stringify(last.detail)}</code>
                  ) : (
                    '—'
                  )}
                  {failures > 0 && (
                    <div className={s.metricHint}>{failures} failed of the last {last ? byName.get(job.name)?.length : 0}</div>
                  )}
                </td>
                <td>
                  <strong>{verdict.bad ? '⚠ ' : ''}</strong>
                  {verdict.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.sectionLabel}>pg_cron — jobs running inside the database</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Last run</th>
              <th>Outcome</th>
              <th>24h</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {pgRows.map((j) => {
              return (
                <tr key={j.jobname}>
                  <td>
                    {j.jobname}
                    <div className={s.metricHint}>
                      <code>{j.command}</code>
                    </div>
                  </td>
                  <td>
                    <code>{j.schedule}</code>
                  </td>
                  <td>{fmtWhen(j.last_start)}</td>
                  <td>
                    {j.last_status ?? '—'}
                    {j.last_message && <div className={s.metricHint}>{j.last_message}</div>}
                  </td>
                  <td>
                    {j.runs_24h} run{j.runs_24h === 1 ? '' : 's'}
                    {j.failures_24h > 0 && (
                      <div className={s.metricHint}>{j.failures_24h} failed</div>
                    )}
                  </td>
                  <td>
                    {!j.active
                      ? '⚠ disabled'
                      : !j.last_start
                        ? '⚠ never run'
                        : j.failures_24h > 0
                          ? `⚠ ${j.failures_24h} failed today`
                          : 'running to schedule'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={s.sub}>
        A Vercel job reading <em>never seen</em> has not called in since this page
        started recording, which is either a job added in the last few minutes or one
        that is not registered at all — check Settings → Cron Jobs in Vercel. pg_cron
        jobs are read live from the database, so that list is always the truth about
        what is scheduled there.
      </p>
    </div>
  );
}
