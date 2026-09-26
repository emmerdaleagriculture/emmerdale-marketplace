import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { timeAgo } from '@/lib/time';
import s from '../admin.module.css';
import { AdminTable } from '../ui';

export const metadata: Metadata = { title: 'Email — Admin' };
export const dynamic = 'force-dynamic';

const GIVE_UP_AT = 5; // send-emails stops retrying here
const PROBLEM = new Set(['bounced', 'complained', 'failed', 'suppressed']);

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
 *
 * Delivery is a third thing again. `status` says Resend accepted the message;
 * `delivery_status`, filled in by the webhook at /api/email-events, says
 * whether it reached anyone. A job once went to a domain that did not exist
 * and showed two green rows here while the customer waited.
 */
export default async function AdminEmailPage() {
  const admin = createServiceRoleClient();

  const [counts, recent, stuck, undelivered, drain] = await Promise.all([
    // Counted in SQL. Reading the rows to count them here stopped being
    // honest when the table passed the API's 1000-row cap.
    admin.rpc('email_queue_counts'),
    admin
      .from('pending_emails')
      .select('id, kind, to_email, status, attempts, created_at, sent_at, delivery_status')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('pending_emails')
      .select('id, kind, to_email, attempts, created_at')
      .neq('status', 'sent')
      .gte('attempts', GIVE_UP_AT)
      .order('created_at', { ascending: true })
      .limit(50),
    // Accepted by Resend and then rejected by the recipient. The row reads
    // "sent" either way, which is exactly how a customer at a domain that does
    // not exist went unnoticed.
    admin
      .from('pending_emails')
      .select('id, kind, to_email, delivery_status, delivery_detail, delivery_at')
      .in('delivery_status', ['bounced', 'complained', 'failed', 'suppressed'])
      .order('delivery_at', { ascending: false })
      .limit(25),
    admin.rpc('email_drain_health', { p_limit: 5 }),
  ]);

  // A row held back by send_after is a delivery retry waiting out its delay —
  // deliberately parked, not stuck. Counting it as pending would put "Oldest
  // waiting: 4 hours ago" on a perfectly healthy drain, which is precisely
  // the reading this page exists to make trustworthy. The split is made in
  // email_queue_counts.
  const q = (counts.data ?? {}) as {
    pending?: number; held?: number; failed?: number; sent_week?: number; oldest_pending?: string | null;
  };
  const pending = q.pending ?? 0;
  const held = q.held ?? 0;
  const failed = q.failed ?? 0;
  const sentWeek = q.sent_week ?? 0;
  const oldestPending = q.oldest_pending ?? null;

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
        What the funnel has sent, what it is waiting to send, whether any of it
        actually arrived, and whether the drain is running at all.
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
      <AdminTable head={['Waiting', 'Given up', 'Failed', 'Sent, last 7 days', 'Oldest waiting']}>
        <tr>
          <td>{pending}</td>
          <td>{stuck.data?.length ?? 0}</td>
          <td>{failed}</td>
          <td>{sentWeek}</td>
          <td>
            {oldestPending ? timeAgo(oldestPending) : '—'}
            {held > 0 && (
              <div className={s.metricHint}>
                +{held} held for a later retry
              </div>
            )}
          </td>
        </tr>
      </AdminTable>

      {(stuck.data ?? []).length > 0 && (
        <>
          <div className={s.sectionLabel}>
            Given up — {GIVE_UP_AT} attempts reached, these will never send
          </div>
          <AdminTable head={['Kind', 'To', 'Attempts', 'Age']}>
            {(stuck.data ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.kind}</td>
                <td>{r.to_email ?? '—'}</td>
                <td>{r.attempts}</td>
                <td>{timeAgo(r.created_at)}</td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}

      {(undelivered.data ?? []).length > 0 && (
        <>
          <div className={s.sectionLabel}>
            Did not arrive — accepted by Resend, then rejected by the recipient
          </div>
          <AdminTable head={['Kind', 'To', 'What happened', 'Reason', 'When']}>
            {(undelivered.data ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.kind}</td>
                <td>{r.to_email ?? '—'}</td>
                <td>{r.delivery_status}</td>
                <td>{r.delivery_detail ?? '—'}</td>
                <td>{r.delivery_at ? timeAgo(r.delivery_at) : '—'}</td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}

      <div className={s.sectionLabel}>Recent messages</div>
      {(recent.data ?? []).length === 0 ? (
        <div className={s.empty}>Nothing queued yet.</div>
      ) : (
        <AdminTable head={['Kind', 'To', 'Status', 'Delivery', 'Attempts', 'Queued', 'Sent']}>
          {(recent.data ?? []).map((r) => (
            <tr key={r.id}>
              <td>{r.kind}</td>
              <td>{r.to_email ?? '—'}</td>
              <td>{r.status}</td>
              <td style={PROBLEM.has(r.delivery_status ?? '') ? { color: '#a02a2a', fontWeight: 600 } : undefined}>
                {r.status === 'sent' ? (r.delivery_status ?? 'no report yet') : '—'}
              </td>
              <td>{r.attempts}</td>
              <td>{timeAgo(r.created_at)}</td>
              <td>{r.sent_at ? timeAgo(r.sent_at) : '—'}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
