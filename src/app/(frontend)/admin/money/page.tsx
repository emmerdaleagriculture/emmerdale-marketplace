import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Money — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Money view (spec v1.6 §30 view 4): what has come in and what is still owed —
 * one of the two screens where both sides' figures appear (§29).
 *
 * A job now has TWO payment rows: the deposit taken at acceptance and the
 * balance that falls due at sign-off. So the table lists movements of money,
 * not jobs, and the per-row "margin" it used to show (row amount minus the
 * contractor's whole price) is gone — on a deposit row it was a large negative
 * number. Margin is a per-job figure and lives on the dashboard; what belongs
 * here is which money has arrived and which has not.
 */
export default async function MoneyPage() {
  const admin = createServiceRoleClient();

  const { data: payments } = await admin
    .from('job_payments')
    .select(
      `id, status, kind, amount_pence, paid_at, created_at, due_at, attempts, last_error,
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

  // Balances signed off but not yet collected. This is the number that did not
  // exist under the old model and is the one worth watching: money the
  // business has promised a contractor and has not been paid.
  const owed = rows.filter((r) => r.kind === 'balance' && ['due', 'failed'].includes(r.status));
  const totalOwed = owed.reduce((sum, r) => sum + r.amount_pence, 0);
  const stuck = owed.filter((r) => r.status === 'failed').length;

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
          <div className={s.metricLabel}>Collected on live jobs</div>
          <div className={s.metricHint}>{held.length} payments on jobs not yet complete</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>{formatGBP(totalOwed)}</div>
          <div className={s.metricLabel}>Balances outstanding</div>
          <div className={s.metricHint}>
            {owed.length} awaiting collection{stuck > 0 ? ` · ${stuck} failed` : ''}
          </div>
        </div>
        <div className={s.metric}>
          <div className={s.metricValue}>
            {formatGBP(rows.filter((r) => r.status === 'paid').reduce((s2, r) => s2 + r.amount_pence, 0))}
          </div>
          <div className={s.metricLabel}>Taken (recent)</div>
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
                <th>Part</th>
                <th>Amount</th>
                <th>Job total</th>
                <th>Contractor gets</th>
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
                const quote = r.quote as
                  | { contractor_quote_id: string; client_price_pence: number }
                  | null;
                const cPrice = quote ? (contractorPrice.get(quote.contractor_quote_id) ?? null) : null;
                const jobTotal = quote?.client_price_pence ?? null;
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
                    <td>{r.kind === 'balance' ? 'Balance' : 'Deposit'}</td>
                    <td>{formatGBP(r.amount_pence)}</td>
                    <td>{jobTotal !== null ? formatGBP(jobTotal) : '—'}</td>
                    <td>{cPrice !== null ? formatGBP(cPrice) : '—'}</td>
                    <td title={r.last_error ?? undefined}>
                      {r.status}
                      {r.status === 'failed' && r.attempts ? ` (${r.attempts} tries)` : ''}
                    </td>
                    <td>{sub?.status ?? '—'}</td>
                    <td>
                      {r.paid_at
                        ? formatDateTime(r.paid_at)
                        : r.due_at && r.kind === 'balance'
                          ? `due ${formatDateTime(r.due_at)}`
                          : formatDateTime(r.created_at)}
                    </td>
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
