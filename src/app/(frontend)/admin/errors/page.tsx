import type { Metadata } from 'next';
import Link from 'next/link';
import { loadAdminErrors } from '@/lib/adminErrors';
import { loadSentryIssues } from '@/lib/sentry/issues';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Errors — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Everything that went wrong, from the two places it gets recorded.
 *
 * Sentry holds what threw — the crashes nobody was told about until it was
 * wired up. The database holds what did not throw: a customer refused at step
 * 1, an email that bounced after being accepted, a balance the worker gave up
 * on. Those are handled outcomes, working code and bad news, and they are the
 * ones that quietly cost money.
 *
 * Neither half is the whole picture, which is why they are on one page.
 */

const fmtWhen = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ErrorsPage() {
  const [db, sentry] = await Promise.all([loadAdminErrors(), loadSentryIssues()]);

  const sentryCount = sentry.configured && sentry.ok ? sentry.issues.length : null;
  const refusalTotal = db.refusals.reduce((n, r) => n + r.count, 0);
  const emailTotal = db.emails.reduce((n, e) => n + e.count, 0);

  return (
    <div>
      <h1 className={s.h1}>Errors</h1>
      <p className={s.sub}>
        What threw, from Sentry, and what didn&rsquo;t, from our own tables — the last{' '}
        {db.days} days. A handled refusal is not a crash, but it is still someone who
        did not get what they came for.{' '}
        <Link href="/admin/reporting/journey?path=/start">The funnel is next door.</Link>
      </p>

      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricLabel}>Unhandled</div>
          <div className={s.metricValue}>{sentryCount ?? '—'}</div>
          <div className={s.metricHint}>
            {sentry.configured ? 'open in Sentry, 14d' : 'Sentry not readable'}
          </div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Turned away</div>
          <div className={s.metricValue}>{refusalTotal}</div>
          <div className={s.metricHint}>refused at /start</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Email lost</div>
          <div className={s.metricValue}>{emailTotal}</div>
          <div className={s.metricHint}>failed or bounced</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricLabel}>Payments</div>
          <div className={s.metricValue}>{db.payments.length}</div>
          <div className={s.metricHint}>with a recorded error</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Unhandled exceptions (Sentry)</div>
      {!sentry.configured ? (
        <div className={s.empty}>
          <strong>Sentry is capturing errors, but this page cannot read them back.</strong>
          <br />
          Reporting works — the app sends to Sentry from the server, the browser and
          the edge. Listing issues here needs <code>SENTRY_AUTH_TOKEN</code> (scope{' '}
          <code>org:read</code>) set in Vercel, which is the same token source maps
          need. Until then this section is blank because it is blind, not because
          nothing has happened: check{' '}
          <a href="https://emmerdale-agriculture-ltd.sentry.io/issues/" target="_blank" rel="noreferrer">
            Sentry directly
          </a>
          .
        </div>
      ) : !sentry.ok ? (
        <div className={s.empty}>
          Could not read Sentry: {sentry.error}. The app is still reporting to it — this
          is the read path only.
        </div>
      ) : sentry.issues.length === 0 ? (
        <div className={s.empty}>
          No unresolved issues in the last 14 days. This one does mean nothing has
          happened — the token is working.
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Error</th><th>Where</th><th>Events</th><th>People</th><th>Last</th></tr>
            </thead>
            <tbody>
              {sentry.issues.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.permalink ? (
                      <a href={i.permalink} target="_blank" rel="noreferrer">{i.title}</a>
                    ) : (
                      i.title
                    )}
                    {i.value && <div className={s.metricHint}>{i.value}</div>}
                  </td>
                  <td><code>{i.culprit ?? '—'}</code></td>
                  <td>{i.count}</td>
                  <td>{i.userCount}</td>
                  <td>{fmtWhen(i.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Turned away at /start</div>
      {db.refusals.length === 0 ? (
        <div className={s.empty}>Nobody was refused in the last {db.days} days.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Step</th><th>Reason</th><th>Times</th><th>Last</th></tr>
            </thead>
            <tbody>
              {db.refusals.map((r) => (
                <tr key={`${r.action}-${r.outcome}-${r.reason}`}>
                  <td>{r.action === 'parse' ? 'Step 1' : 'Step 2'}</td>
                  <td style={{ color: r.outcome === 'fallback' ? '#8a6d1f' : '#a02a2a' }}>
                    <code>{r.reason}</code>
                    {r.outcome === 'fallback' && ' — let through'}
                  </td>
                  <td>{r.count}</td>
                  <td>{fmtWhen(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Email that never arrived</div>
      {db.emails.length === 0 ? (
        <div className={s.empty}>Everything sent in the last {db.days} days was delivered.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Kind</th><th>What happened</th><th>Detail</th><th>Times</th><th>Last</th></tr>
            </thead>
            <tbody>
              {db.emails.map((e) => (
                <tr key={`${e.kind}-${e.status}-${e.detail ?? ''}`}>
                  <td><code>{e.kind}</code></td>
                  <td style={{ color: e.status === 'suppressed' ? '#8a6d1f' : '#a02a2a' }}>
                    {e.status}
                  </td>
                  <td>{e.detail ?? '—'}</td>
                  <td>{e.count}</td>
                  <td>{fmtWhen(e.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Payments that failed</div>
      {db.payments.length === 0 ? (
        <div className={s.empty}>
          No payment has recorded an error in the last {db.days} days.
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Kind</th><th>Status</th><th>Amount</th><th>Tries</th><th>Error</th><th>Last</th></tr>
            </thead>
            <tbody>
              {db.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.kind ?? '—'}</td>
                  <td style={{ color: p.status === 'failed' ? '#a02a2a' : '#8a6d1f' }}>{p.status}</td>
                  <td>{fmtGBP(p.amount_pence)}</td>
                  <td>{p.attempts ?? 0}</td>
                  <td>{p.last_error ?? '—'}</td>
                  <td>{fmtWhen(p.last_attempt_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
