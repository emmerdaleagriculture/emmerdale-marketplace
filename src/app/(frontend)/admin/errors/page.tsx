import type { Metadata } from 'next';
import Link from 'next/link';
import { loadAdminErrors } from '@/lib/adminErrors';
import { loadSentryIssues } from '@/lib/sentry/issues';
import { formatGBP } from '@/lib/sealedQuotes/money';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../ui';

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

      <Tiles>
        <Tile value={sentryCount ?? '—'} label="Unhandled" hint={<>{sentry.configured ? 'open in Sentry, 14d' : 'Sentry not readable'}</>} />
        <Tile value={refusalTotal} label="Turned away" hint="refused at /start" />
        <Tile value={emailTotal} label="Email lost" hint="failed or bounced" />
        <Tile value={db.payments.length} label="Payments" hint="with a recorded error" />
      </Tiles>

      <div className={s.sectionLabel}>Unhandled exceptions (Sentry)</div>
      {!sentry.configured ? (
        <div className={s.empty}>
          <strong>Sentry is capturing errors, but this page cannot read them back.</strong>
          <br />
          Reporting works — the app sends to Sentry from the server, the browser and
          the edge. Listing issues here needs <code>SENTRY_READ_TOKEN</code> set in
          Vercel: a separate token from the one the build uses, because listing
          issues needs the <code>event:read</code> scope and an organization token
          cannot be given it. Until then this section is blank because it is blind,
          not because nothing has happened: check{' '}
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
        <AdminTable head={['Error', 'Where', 'Events', 'People', 'Last']}>
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
              <td>{ago(i.lastSeen)}</td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Turned away at /start</div>
      {db.refusals.length === 0 ? (
        <div className={s.empty}>Nobody was refused in the last {db.days} days.</div>
      ) : (
        <AdminTable head={['Step', 'Reason', 'Times', 'Last']}>
          {db.refusals.map((r) => (
            <tr key={`${r.action}-${r.outcome}-${r.reason}`}>
              <td>{r.action === 'parse' ? 'Step 1' : 'Step 2'}</td>
              <td style={{ color: r.outcome === 'fallback' ? '#8a6d1f' : '#a02a2a' }}>
                <code>{r.reason}</code>
                {r.outcome === 'fallback' && ' — let through'}
              </td>
              <td>{r.count}</td>
              <td>{ago(r.last)}</td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Email that never arrived</div>
      {db.emails.length === 0 ? (
        <div className={s.empty}>Everything sent in the last {db.days} days was delivered.</div>
      ) : (
        <AdminTable head={['Kind', 'What happened', 'Detail', 'Times', 'Last']}>
          {db.emails.map((e) => (
            <tr key={`${e.kind}-${e.status}-${e.detail ?? ''}`}>
              <td><code>{e.kind}</code></td>
              <td style={{ color: e.status === 'suppressed' ? '#8a6d1f' : '#a02a2a' }}>
                {e.status}
              </td>
              <td>{e.detail ?? '—'}</td>
              <td>{e.count}</td>
              <td>{ago(e.last)}</td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Payments that failed</div>
      {db.payments.length === 0 ? (
        <div className={s.empty}>
          No payment has recorded an error in the last {db.days} days.
        </div>
      ) : (
        <AdminTable head={['Kind', 'Status', 'Amount', 'Tries', 'Error', 'Last']}>
          {db.payments.map((p) => (
            <tr key={p.id}>
              <td>{p.kind ?? '—'}</td>
              <td style={{ color: p.status === 'failed' ? '#a02a2a' : '#8a6d1f' }}>{p.status}</td>
              <td>{formatGBP(p.amount_pence)}</td>
              <td>{p.attempts ?? 0}</td>
              <td>{p.last_error ?? '—'}</td>
              <td>{ago(p.last_attempt_at)}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
