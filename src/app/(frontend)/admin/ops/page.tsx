import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dwell, timeLeft } from '@/lib/time';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { isOverdue } from '@/lib/sealedQuotes/opsThresholds';
import s from '../admin.module.css';
import o from './ops.module.css';

export const metadata: Metadata = { title: 'Ops — Admin' };
export const dynamic = 'force-dynamic';

/**
 * The live operations board (spec v1.6 §30 view 1) — the screen the business
 * actually runs on: every open sealed-quote job grouped by state, oldest
 * dwell first, flagged when past its threshold. Dwell comes from the
 * job_events transition log, which is why that log exists before anything
 * else.
 */

const OPEN_STATES = [
  'confirmed',
  'distributed',
  'quotes_receiving',
  'accepted_awaiting_payment',
  'awarded',
  'contacted',
  'scheduled',
  'in_progress',
  'completed_by_contractor',
  'disputed',
  'variation_pending',
  'variation_declined',
] as const;

const STATE_LABELS: Record<string, string> = {
  confirmed: 'Confirmed — awaiting distribution',
  distributed: 'Distributed — no prices yet',
  quotes_receiving: 'Prices coming in',
  accepted_awaiting_payment: 'Accepted — awaiting payment',
  awarded: 'Awarded — awaiting first contact',
  contacted: 'Contacted',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Awaiting completion confirmation',
  disputed: 'DISPUTED',
  variation_pending: 'Variation pending',
  variation_declined: 'VARIATION DECLINED',
};

export default async function OpsPage() {
  const admin = createServiceRoleClient();

  const [{ data: jobs }, { data: config }] = await Promise.all([
    admin
      .from('job_submissions')
      .select(
        `id, status, created_at, confirmed_at, distributed_at, awarded_at, expires_at,
         contact_name, service:services(name), county:counties(name)`,
      )
      .in('status', [...OPEN_STATES])
      .order('created_at', { ascending: true })
      .limit(500),
    admin.from('app_config').select('value').eq('key', 'sq_test_contractor_allowlist').maybeSingle(),
  ]);

  const testMode = Array.isArray(config?.value) && config.value.length > 0;
  const rows = jobs ?? [];

  // Latest transition per job → time entered current state.
  const ids = rows.map((r) => r.id);
  const enteredAt = new Map<string, string>();
  if (ids.length) {
    const { data: events } = await admin
      .from('job_events')
      .select('job_id, to_status, created_at')
      .in('job_id', ids)
      .eq('event_type', 'status_change')
      .order('created_at', { ascending: true });
    for (const e of events ?? []) {
      if (e.to_status) enteredAt.set(`${e.job_id}:${e.to_status}`, e.created_at);
    }
  }

  // Quote counts for the distributed/receiving rows.
  const quoteCounts = new Map<string, number>();
  const priceTotals = new Map<string, number>();
  if (ids.length) {
    const { data: cq } = await admin
      .from('client_quotes')
      .select('submission_id, client_price_pence, status')
      .in('submission_id', ids);
    for (const q of cq ?? []) {
      if (q.status === 'active' || q.status === 'accepted') {
        quoteCounts.set(q.submission_id, (quoteCounts.get(q.submission_id) ?? 0) + 1);
      }
      if (q.status === 'accepted') priceTotals.set(q.submission_id, q.client_price_pence);
    }
  }

  const grouped = OPEN_STATES.map((state) => ({
    state,
    jobs: rows
      .filter((r) => r.status === state)
      .map((r) => {
        const entered =
          enteredAt.get(`${r.id}:${state}`) ??
          (state === 'confirmed' ? r.confirmed_at : null) ??
          r.distributed_at ??
          r.created_at;
        return { ...r, entered, overdue: isOverdue(state, entered) };
      })
      .sort((a, b) => new Date(a.entered).getTime() - new Date(b.entered).getTime()),
  })).filter((g) => g.jobs.length > 0);

  return (
    <div>
      <h1 className={s.h1}>Operations</h1>
      <p className={s.sub}>
        Every open job, by state, oldest first. Flags mean a job has sat past its
        threshold and needs a human.
      </p>

      {testMode && (
        <div className={o.testBanner}>
          TEST MODE — invitations restricted to the allowlist. Real contractors
          receive nothing. Clear <code>sq_test_contractor_allowlist</code> in
          app_config to go live.
        </div>
      )}

      {grouped.length === 0 && (
        <div className={s.empty}>Nothing open — the board is clear.</div>
      )}

      {grouped.map(({ state, jobs: stateJobs }) => (
        <div key={state}>
          <div className={s.sectionLabel}>
            {STATE_LABELS[state] ?? state} ({stateJobs.length})
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Prices</th>
                  <th>Time in state</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {stateJobs.map((j) => (
                  <tr key={j.id} className={j.overdue ? o.overdueRow : undefined}>
                    <td>
                      <Link href={`/admin/submissions/${j.id}`}>
                        {(j.service as { name: string } | null)?.name ?? '(unmatched)'}
                        {' · '}
                        {(j.county as { name: string } | null)?.name ?? '—'}
                      </Link>
                    </td>
                    <td>{j.contact_name ?? '—'}</td>
                    <td>
                      {quoteCounts.get(j.id) ?? 0}
                      {priceTotals.has(j.id) ? ` · ${formatGBP(priceTotals.get(j.id)!)}` : ''}
                    </td>
                    <td>
                      {dwell(j.entered)}
                      {j.overdue && <span className={o.overduePill}>OVERDUE</span>}
                    </td>
                    <td>{j.expires_at ? timeLeft(j.expires_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
