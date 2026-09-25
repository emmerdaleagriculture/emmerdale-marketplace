import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import s from '../../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../../ui';

export const metadata: Metadata = { title: 'Messages — Admin' };
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 8;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '—');

type Msg = {
  submission_id: string;
  invitation_id: string;
  sender: 'client' | 'contractor';
  phase: 'pre_award' | 'post_award';
  created_at: string;
  read_at: string | null;
};

/** Monday 00:00 UTC of the week an instant falls in. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * How much the customer↔contractor threads (20260925140000) are used, and
 * whether anyone answers. A conversation is one thread — a customer and one
 * contractor on one job. "Answered" means both sides have written in it,
 * which is the difference between a feature people talk through and one
 * that collects unanswered questions.
 */
export default async function MessagesReportPage() {
  const admin = createServiceRoleClient();
  const [msgsQ, alertsQ] = await Promise.all([
    admin
      .from('job_messages')
      .select('submission_id, invitation_id, sender, phase, created_at, read_at')
      .order('created_at', { ascending: true })
      .limit(20000),
    admin
      .from('pending_emails')
      .select('id', { count: 'exact', head: true })
      .in('kind', ['sq_message_to_client', 'sq_message_to_contractor'])
      .eq('status', 'sent'),
  ]);
  const msgs = (msgsQ.data ?? []) as Msg[];
  const now = Date.now();
  const since = (days: number) => msgs.filter((m) => now - Date.parse(m.created_at) < days * DAY).length;

  // ── Conversations ────────────────────────────────────────────────────
  type Thread = {
    invitationId: string;
    submissionId: string;
    count: number;
    fromClient: number;
    fromContractor: number;
    last: Msg;
    unread: number;
  };
  const threads = new Map<string, Thread>();
  for (const m of msgs) {
    const t = threads.get(m.invitation_id) ?? {
      invitationId: m.invitation_id,
      submissionId: m.submission_id,
      count: 0,
      fromClient: 0,
      fromContractor: 0,
      last: m,
      unread: 0,
    };
    t.count += 1;
    if (m.sender === 'client') t.fromClient += 1;
    else t.fromContractor += 1;
    if (!m.read_at) t.unread += 1;
    t.last = m;
    threads.set(m.invitation_id, t);
  }
  const all = [...threads.values()];
  const answered = all.filter((t) => t.fromClient > 0 && t.fromContractor > 0).length;
  const jobs = new Set(msgs.map((m) => m.submission_id)).size;
  // Waiting on someone for more than a day: the thread is going cold.
  const unreadOld = msgs.filter((m) => !m.read_at && now - Date.parse(m.created_at) > DAY).length;

  // ── Weekly ───────────────────────────────────────────────────────────
  const weeks: string[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) weeks.push(weekStart(new Date(now - i * 7 * DAY).toISOString()));
  const byWeek = new Map(
    weeks.map((w) => [w, { total: 0, client: 0, contractor: 0, threads: new Set<string>() }]),
  );
  for (const m of msgs) {
    const w = byWeek.get(weekStart(m.created_at));
    if (!w) continue;
    w.total += 1;
    if (m.sender === 'client') w.client += 1;
    else w.contractor += 1;
    w.threads.add(m.invitation_id);
  }

  // ── Latest conversations, with who they are between ─────────────────
  const recent = all
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
    .slice(0, 25);
  const { data: invs } = recent.length
    ? await admin
        .from('job_invitations')
        .select('id, display_label, contractor:contractors (business_name)')
        .in(
          'id',
          recent.map((t) => t.invitationId),
        )
    : { data: [] };
  const who = new Map(
    (invs ?? []).map((i) => [
      i.id,
      `${i.display_label ?? '—'}${
        (i.contractor as { business_name: string | null } | null)?.business_name
          ? ` · ${(i.contractor as { business_name: string }).business_name}`
          : ''
      }`,
    ]),
  );

  return (
    <>
      <h1 className={s.h1}>Messages</h1>
      <p className={s.sub}>
        Messages between customers and contractors on the job pages. A conversation is one
        customer and one contractor on one job; answered means both have written in it.
        {msgsQ.error ? ' Could not read messages — figures below are empty.' : ''}
      </p>

      <Tiles>
        <Tile value={msgs.length} label="Messages sent" hint={`${since(7)} in the last 7 days`} />
        <Tile value={since(30)} label="Last 30 days" />
        <Tile
          value={all.length}
          label="Conversations"
          hint={`on ${jobs} job${jobs === 1 ? '' : 's'}`}
        />
        <Tile value={pct(answered, all.length)} label="Answered" hint={`${answered} of ${all.length}`} />
        <Tile
          value={msgs.filter((m) => m.sender === 'client').length}
          label="From customers"
          hint={`${msgs.filter((m) => m.sender === 'contractor').length} from contractors`}
        />
        <Tile
          value={msgs.filter((m) => m.phase === 'pre_award').length}
          label="Before award"
          hint={`${msgs.filter((m) => m.phase === 'post_award').length} after`}
        />
        <Tile value={alertsQ.count ?? 0} label="Alert emails sent" />
        <Tile
          value={unreadOld}
          label="Unread over a day"
          hint="Waiting on someone to open their job page"
          warn={unreadOld > 0}
        />
      </Tiles>

      <div className={s.sectionLabel}>By week</div>
      <AdminTable head={['Week of', 'Messages', 'From customers', 'From contractors', 'Conversations']}>
        {[...weeks].reverse().map((w) => {
          const r = byWeek.get(w)!;
          return (
            <tr key={w}>
              <td>
                {new Date(`${w}T00:00:00Z`).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </td>
              <td>{r.total}</td>
              <td>{r.client}</td>
              <td>{r.contractor}</td>
              <td>{r.threads.size}</td>
            </tr>
          );
        })}
      </AdminTable>

      <div className={s.sectionLabel}>Latest conversations</div>
      {recent.length === 0 ? (
        <p className={s.sub}>No messages yet.</p>
      ) : (
        <AdminTable head={['Last message', 'Job', 'Contractor', 'Messages', 'Last from', 'Unread']}>
          {recent.map((t) => (
            <tr key={t.invitationId}>
              <td>{ago(t.last.created_at)}</td>
              <td>
                <Link href={`/admin/submissions/${t.submissionId}`}>
                  {t.submissionId.slice(0, 8)}
                </Link>
              </td>
              <td>{who.get(t.invitationId) ?? '—'}</td>
              <td>
                {t.count} ({t.fromClient} customer, {t.fromContractor} contractor)
              </td>
              <td>{t.last.sender === 'client' ? 'Customer' : 'Contractor'}</td>
              <td>{t.unread || '—'}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
