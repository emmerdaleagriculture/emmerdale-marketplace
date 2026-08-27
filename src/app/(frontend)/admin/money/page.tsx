import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Money — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Money view (spec v1.6 §30 view 4): held funds, per-job margin — one of the
 * two screens where both prices appear (§29). Contractor payouts are Part 3;
 * "released" here means the job reached completed/paid.
 */
export default async function MoneyPage() {
  const admin = createServiceRoleClient();

  const { data: payments } = await admin
    .from('job_payments')
    .select(
      `id, status, amount_pence, paid_at, created_at,
       submission:job_submissions(id, status, contact_name, service:services(name)),
       quote:client_quotes(client_price_pence, contractor_quote_id)`,
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = payments ?? [];
  const contractorPrice = new Map<string, number>();
  const cqIds = rows
    .map((r) => (r.quote as { contractor_quote_id: string } | null)?.contractor_quote_id)
    .filter(Boolean) as string[];
  if (cqIds.length) {
    const { data: cqs } = await admin
      .from('contractor_quotes')
      .select('id, contractor_price_pence')
      .in('id', cqIds);
    for (const c of cqs ?? []) contractorPrice.set(c.id, c.contractor_price_pence);
  }

  const held = rows.filter(
    (r) =>
      r.status === 'paid' &&
      !['completed', 'paid'].includes((r.submission as { status: string } | null)?.status ?? ''),
  );
  const totalHeld = held.reduce((sum, r) => sum + r.amount_pence, 0);

  return (
    <div>
      <h1 className={s.h1}>Money</h1>
      <p className={s.sub}>
        Client payments in and what Emmerdale holds. This is one of the only
        screens where both sides&rsquo; figures appear.
      </p>

      <div className={s.metricGrid}>
        <div className={s.metric}>
          <div className={s.metricValue}>{formatGBP(totalHeld)}</div>
          <div className={s.metricLabel}>Held right now</div>
          <div className={s.metricHint}>{held.length} paid jobs not yet complete</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>
            {formatGBP(rows.filter((r) => r.status === 'paid').reduce((s2, r) => s2 + r.amount_pence, 0))}
          </div>
          <div className={s.metricLabel}>Taken all-time</div>
          <div className={s.metricHint}>last {rows.length} payments shown below</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Payments</div>
      {rows.length === 0 ? (
        <div className={s.empty}>No payments yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer paid</th>
                <th>Contractor gets</th>
                <th>Margin</th>
                <th>Payment</th>
                <th>Job status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sub = r.submission as {
                  id: string;
                  status: string;
                  contact_name: string | null;
                  service: { name: string } | null;
                } | null;
                const cqId = (r.quote as { contractor_quote_id: string } | null)
                  ?.contractor_quote_id;
                const cPrice = cqId ? (contractorPrice.get(cqId) ?? null) : null;
                return (
                  <tr key={r.id}>
                    <td>
                      {sub ? (
                        <Link href={`/admin/submissions/${sub.id}`}>
                          {sub.service?.name ?? '—'} · {sub.contact_name ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{formatGBP(r.amount_pence)}</td>
                    <td>{cPrice !== null ? formatGBP(cPrice) : '—'}</td>
                    <td>{cPrice !== null ? formatGBP(r.amount_pence - cPrice) : '—'}</td>
                    <td>{r.status}</td>
                    <td>{sub?.status ?? '—'}</td>
                    <td>{r.paid_at ? formatDateTime(r.paid_at) : formatDateTime(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
