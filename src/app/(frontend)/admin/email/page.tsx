import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { timeAgo } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Email — Admin' };
export const dynamic = 'force-dynamic';

const GIVE_UP_AT = 5; // send-emails stops retrying here

/**
 * The email queue. Every notification in the funnel — invitations, quote
 * digests, payment links, completion confirmations — is queued into
 * pending_emails by database functions and drained by the send-emails Edge
 * Function on a one-minute pg_cron schedule.
 *
 * Nothing surfaced any of it: whether mail was flowing could only be answered
 * with psql. An empty queue looks the same whether the drain is healthy or
 * dead, so the drain reports separately from the queue — that distinction is
 * the whole point of the page.
 */
export default async function AdminEmailPage() {
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [counts, recent, stuck, drain] = await Promise.all([
    admin.from('pending_emails').select('status, attempts, created_at'),
    admin
      .from('pending_emails')
      .select('id, kind, to_email, status, attempts, created_at, sent_at')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('pending_emails')
      .select('id, kind, to_email, attempts, created_at')
      .neq('status', 'sent')
      .gte('attempts', GIVE_UP_AT)
      .order('created_at', { ascending: true })
      .limit(50),
    admin.rpc('email_drain_health', { p_limit: 5 }),
  ]);

  const all = counts.data ?? [];
  const pending = all.filter((r) => r.status === 'pending');
  const failed = all.filter((r) => r.status === 'failed');
  const sentWeek = all.filter((r) => r.status === 'sent' && r.created_at >= since);
  const oldestPending = pending
    .map((r) => r.created_at)
    .sort()
    .at(0);

  const ticks = (drain.data ?? []) as { status_code: number; body: string; called_at: string }[];
  const lastTick = ticks[0];
  // Cron runs every minute; more than five without a call means it isn't running.
  const drainStale =
    !lastTick || Date.now() - new Date(lastTick.called_at).getTime() > 5 * 60 * 1000;
  const drainBad = drainStale || ticks.some((t) => t.status_code >= 300);

  return (
    <div>
      <h1 className={s.h1}>Email</h1>
      <p className={s.sub}>
        What the funnel has sent, what it is waiting to send, and whether the drain is
        running at all.
      </p>

      <div className={s.sectionLabel}>The drain</div>
      <div className={s.empty} style={{ borderLeft: `3px solid ${drainBad ? '#a02a2a' : '#2e6b4f'}` }}>
        {!lastTick ? (
          <>No record of the drain ever running. Mail will queue and never send.</>
        ) : (
          <>
            Last ran <strong>{timeAgo(lastTick.called_at)}</strong>, returned{' '}
            <strong>{lastTick.status_code}</strong>.{' '}
            {drainStale
              ? 'That is more than five minutes ago — the schedule is not running.'
              : ticks.some((t) => t.status_code >= 300)
                ? 'Recent calls have failed — check the function secrets and the Vault cron_secret.'
                : 'Healthy.'}
          </>
        )}
      </div>

      <div className={s.sectionLabel}>Queue</div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr><th>Waiting</th><th>Given up</th><th>Failed</th><th>Sent, last 7 days</th><th>Oldest waiting</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{pending.length}</td>
              <td>{stuck.data?.length ?? 0}</td>
              <td>{failed.length}</td>
              <td>{sentWeek.length}</td>
              <td>{oldestPending ? timeAgo(oldestPending) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {(stuck.data ?? []).length > 0 && (
        <>
          <div className={s.sectionLabel}>
            Given up — {GIVE_UP_AT} attempts reached, these will never send
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Kind</th><th>To</th><th>Attempts</th><th>Age</th></tr>
              </thead>
              <tbody>
                {(stuck.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td>
                    <td>{r.to_email ?? '—'}</td>
                    <td>{r.attempts}</td>
                    <td>{timeAgo(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={s.sectionLabel}>Recent messages</div>
      {(recent.data ?? []).length === 0 ? (
        <div className={s.empty}>Nothing queued yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Kind</th><th>To</th><th>Status</th><th>Attempts</th><th>Queued</th><th>Sent</th></tr>
            </thead>
            <tbody>
              {(recent.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.kind}</td>
                  <td>{r.to_email ?? '—'}</td>
                  <td>{r.status}</td>
                  <td>{r.attempts}</td>
                  <td>{timeAgo(r.created_at)}</td>
                  <td>{r.sent_at ? timeAgo(r.sent_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
