import type { Metadata } from 'next';
import Link from 'next/link';
import { loadAdminErrors } from '@/lib/adminErrors';
import { loadSentryIssues } from '@/lib/sentry/issues';
import { latest as latestHeartbeat } from '@/lib/heartbeat/run';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ackErrorAction, resolveSentryAction, runHeartbeatAction } from './actions';
import { formatGBP } from '@/lib/sealedQuotes/money';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../ui';

export const metadata: Metadata = { title: 'Errors · Admin' };
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

/** A small inline button that posts one form. */
function RowButton({ action, fields, label }: { action: (fd: FormData) => Promise<void>; fields: Record<string, string>; label: string }) {
  return (
    <form action={action} style={{ display: 'inline' }}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" style={{ font: 'inherit', fontSize: 12, padding: '2px 8px', border: '1px solid #ccc', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>
        {label}
      </button>
    </form>
  );
}

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const [raw, sentry, beats, acksQ] = await Promise.all([
    loadAdminErrors(),
    loadSentryIssues(),
    latestHeartbeat(),
    createServiceRoleClient().from('admin_error_acks').select('section, key, acked_at'),
  ]);
  // Rows someone has cleared stay hidden until they happen again.
  const acked = new Map((acksQ.data ?? []).map((a) => [`${a.section}|${a.key}`, a.acked_at]));
  const live = (section: string, key: string, last: string | null) => {
    const at = acked.get(`${section}|${key}`);
    return !at || (last !== null && last > at);
  };
  const refusalKey = (r: { action: string; outcome: string; reason: string }) => `${r.action}|${r.outcome}|${r.reason}`;
  const emailKey = (e: { kind: string; status: string; detail: string | null }) => `${e.kind}|${e.status}|${e.detail ?? ''}`;
  const db = {
    ...raw,
    refusals: raw.refusals.filter((r) => live('refusal', refusalKey(r), r.last)),
    emails: raw.emails.filter((e) => live('email', emailKey(e), e.last)),
    payments: raw.payments.filter((p) => live('payment', String(p.id), p.last_attempt_at ?? null)),
  };
  const beatRows = [...beats.values()].sort((a, b) => Number(a.ok) - Number(b.ok) || a.check_name.localeCompare(b.check_name));
  const failingBeats = beatRows.filter((b) => !b.ok).length;

  const sentryCount = sentry.configured && sentry.ok ? sentry.issues.length : null;
  const refusalTotal = db.refusals.reduce((n, r) => n + r.count, 0);
  const emailTotal = db.emails.reduce((n, e) => n + e.count, 0);

  return (
    <div>
      <h1 className={s.h1}>Errors</h1>
      <p className={s.sub}>
        What threw, from Sentry, and what didn&rsquo;t, from our own tables: the last{' '}
        {db.days} days. A handled refusal is not a crash, but it is still someone who
        did not get what they came for.{' '}
        <Link href="/admin/reporting/journey?path=/start">The funnel is next door.</Link>
      </p>

      {msg && <div className={s.empty} role="status">{msg}</div>}

      <Tiles>
        <Tile value={beatRows.length ? failingBeats : '—'} label="Heartbeat" hint={beatRows.length ? `failing of ${beatRows.length} checks` : 'not run yet'} />
        <Tile value={sentryCount ?? '—'} label="Unhandled" hint={<>{sentry.configured ? 'open in Sentry, 14d' : 'Sentry not readable'}</>} />
        <Tile value={refusalTotal} label="Turned away" hint="refused at /start" />
        <Tile value={emailTotal} label="Email lost" hint="failed or bounced" />
        <Tile value={db.payments.length} label="Payments" hint="with a recorded error" />
      </Tiles>

      <div className={s.sectionLabel}>
        Heartbeat: every 15 minutes{' '}
        <RowButton action={runHeartbeatAction} fields={{}} label="Run now" />
      </div>
      {beatRows.length === 0 ? (
        <div className={s.empty}>The heartbeat has not run yet. It runs every 15 minutes, or press Run now.</div>
      ) : (
        <AdminTable head={['Check', 'State', 'Detail', 'Checked', 'Last ok']}>
          {beatRows.map((b) => (
            <tr key={b.check_name}>
              <td>{b.check_name}</td>
              <td style={{ color: b.ok ? '#2f6b2f' : '#a02a2a', fontWeight: 600 }}>{b.ok ? 'ok' : 'failing'}</td>
              <td>{b.detail ?? '—'}</td>
              <td>{ago(b.checked_at)}</td>
              <td>{b.ok ? '—' : b.lastOk ? ago(b.lastOk) : 'not in 3 days'}</td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Unhandled exceptions (Sentry)</div>
      {!sentry.configured ? (
        <div className={s.empty}>
          <strong>Sentry is capturing errors, but this page cannot read them back.</strong>
          <br />
          Reporting works: the app sends to Sentry from the server, the browser and
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
          Could not read Sentry: {sentry.error}. The app is still reporting to it. This
          is the read path only.
        </div>
      ) : sentry.issues.length === 0 ? (
        <div className={s.empty}>
          No unresolved issues in the last 14 days. This one does mean nothing has
          happened: the token is working.
        </div>
      ) : (
        <AdminTable head={['Error', 'Where', 'Events', 'People', 'Last', '']}>
          {sentry.issues.map((i) => (
            <tr key={i.id}>
              <td>
                <Link href={`/admin/errors/${i.id}`}>{i.title}</Link>
                {i.permalink && (
                  <>
                    {' '}
                    <a href={i.permalink} target="_blank" rel="noreferrer" className={s.metricHint}>Sentry ↗</a>
                  </>
                )}
                {i.value && <div className={s.metricHint}>{i.value}</div>}
              </td>
              <td><code>{i.culprit ?? '—'}</code></td>
              <td>{i.count}</td>
              <td>{i.userCount}</td>
              <td>{ago(i.lastSeen)}</td>
              <td><RowButton action={resolveSentryAction} fields={{ id: i.id }} label="Resolve" /></td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Turned away at /start</div>
      {db.refusals.length === 0 ? (
        <div className={s.empty}>Nobody was refused in the last {db.days} days.</div>
      ) : (
        <AdminTable head={['Step', 'Reason', 'Times', 'Last', '']}>
          {db.refusals.map((r) => (
            <tr key={`${r.action}-${r.outcome}-${r.reason}`}>
              <td>{r.action === 'parse' ? 'Step 1' : 'Step 2'}</td>
              <td style={{ color: r.outcome === 'fallback' ? '#8a6d1f' : '#a02a2a' }}>
                <code>{r.reason}</code>
                {r.outcome === 'fallback' && ' · let through'}
              </td>
              <td>{r.count}</td>
              <td>{ago(r.last)}</td>
              <td><RowButton action={ackErrorAction} fields={{ section: 'refusal', key: refusalKey(r) }} label="Clear" /></td>
            </tr>
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>Email that never arrived</div>
      {db.emails.length === 0 ? (
        <div className={s.empty}>Everything sent in the last {db.days} days was delivered.</div>
      ) : (
        <AdminTable head={['Kind', 'What happened', 'Detail', 'Times', 'Last', '']}>
          {db.emails.map((e) => (
            <tr key={`${e.kind}-${e.status}-${e.detail ?? ''}`}>
              <td><code>{e.kind}</code></td>
              <td style={{ color: e.status === 'suppressed' ? '#8a6d1f' : '#a02a2a' }}>
                {e.status}
              </td>
              <td>{e.detail ?? '—'}</td>
              <td>{e.count}</td>
              <td>{ago(e.last)}</td>
              <td><RowButton action={ackErrorAction} fields={{ section: 'email', key: emailKey(e) }} label="Clear" /></td>
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
        <AdminTable head={['Kind', 'Status', 'Amount', 'Tries', 'Error', 'Last', '']}>
          {db.payments.map((p) => (
            <tr key={p.id}>
              <td>{p.kind ?? '—'}</td>
              <td style={{ color: p.status === 'failed' ? '#a02a2a' : '#8a6d1f' }}>{p.status}</td>
              <td>{formatGBP(p.amount_pence)}</td>
              <td>{p.attempts ?? 0}</td>
              <td>{p.last_error ?? '—'}</td>
              <td>{ago(p.last_attempt_at)}</td>
              <td><RowButton action={ackErrorAction} fields={{ section: 'payment', key: String(p.id) }} label="Clear" /></td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
