import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDate, formatDateTime } from '@/lib/time';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles } from '../ui';

export const metadata: Metadata = { title: 'Money — Admin' };
export const dynamic = 'force-dynamic';

/**
 * Money view (spec v1.6 §30 view 4): what has come in, what is still owed,
 * and what we owe — one of the two screens where both sides' figures appear
 * (§29).
 *
 * One row per JOB, not per payment. A job pays in two parts — a deposit at
 * acceptance and the balance at sign-off — so the old list of payment rows
 * showed a finished job twice and a customer who never reached the card
 * alongside ones who had paid. Here each job is a line: the quote, the two
 * parts and where each has got to, what is left to collect, what the
 * contractor gets and what we keep. Accepted quotes with no deposit paid are
 * not money and sit in their own short list underneath.
 *
 * Contractor payouts are still paid by hand and nothing records them, so
 * "owed to contractors" is everything on a finished job, not a ledger.
 */

type Payment = {
  id: string;
  kind: 'deposit' | 'balance';
  status: string;
  amount_pence: number;
  refunded_pence: number | null;
  paid_at: string | null;
  due_at: string | null;
  created_at: string;
  attempts: number | null;
  last_error: string | null;
  client_quote_id: string | null;
};

type Job = {
  id: string;
  status: string;
  contact_name: string | null;
  service_verbatim: string | null;
  awarded_at: string | null;
  contractor_invoice_at: string | null;
  service: { name: string } | null;
  contractor: { business_name: string } | null;
  quote: { client_price_pence: number; contractor_quote: { contractor_price_pence: number } | null } | null;
  payments: Payment[];
};

/** Money that reached us: paid, or paid and then partly or wholly refunded. */
const COLLECTED = new Set(['paid', 'partially_refunded', 'refunded']);
/** A job that stopped: whatever was collected stays, nothing more comes. */
const STOPPED = new Set(['cancelled', 'expired', 'no_quotes', 'no_matches']);
/** Finished, so the balance has been opened and the contractor is owed. */
const FINISHED = new Set(['completed', 'paid']);

const STATUS: Record<string, string> = {
  accepted_awaiting_payment: 'Awaiting deposit',
  awarded: 'Awarded',
  contacted: 'Contacted',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Marked done',
  completed: 'Signed off',
  paid: 'Paid in full',
  variation_pending: 'Variation pending',
  variation_declined: 'Variation declined',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** The parsed service, or the customer's own words clipped, or "Job". */
function jobName(j: Job) {
  if (j.service?.name) return j.service.name;
  const words = j.service_verbatim?.trim().replace(/\s+/g, ' ');
  if (!words) return 'Job';
  return words.length > 40 ? `${words.slice(0, 39)}…` : words;
}

function collected(p: Payment) {
  return COLLECTED.has(p.status) ? p.amount_pence - (p.refunded_pence ?? 0) : 0;
}

/** The two parts of a job's price, and where each has got to. */
function partLine(p: Payment | undefined, fallback: string): { text: string; sub?: string; bad?: boolean } {
  if (!p) return { text: fallback };
  const amt = formatGBP(p.amount_pence);
  switch (p.status) {
    case 'paid':
      return { text: amt, sub: p.paid_at ? `paid ${formatDate(p.paid_at)}` : 'paid' };
    case 'partially_refunded':
      return { text: amt, sub: `${formatGBP(p.refunded_pence ?? 0)} refunded` };
    case 'refunded':
      return { text: amt, sub: 'refunded' };
    case 'due':
      return { text: amt, sub: p.due_at ? `due ${formatDate(p.due_at)}` : 'due' };
    case 'failed':
      return { text: amt, sub: `failed${p.attempts ? ` after ${p.attempts} tries` : ''}`, bad: true };
    case 'expired':
      return { text: amt, sub: 'checkout expired' };
    default:
      return { text: amt, sub: 'not paid' };
  }
}

export default async function MoneyPage() {
  const admin = createServiceRoleClient();

  // Every job that reached acceptance has a deposit row, so the payments
  // table is the universe; the job comes along with each of its rows.
  const { data, error } = await admin
    .from('job_payments')
    .select(
      `id, kind, status, amount_pence, refunded_pence, paid_at, due_at, created_at, attempts, last_error, client_quote_id,
       submission:job_submissions!job_payments_submission_id_fkey(
         id, status, contact_name, service_verbatim, awarded_at, contractor_invoice_at,
         service:services(name),
         contractor:contractors!job_submissions_awarded_contractor_id_fkey(business_name),
         quote:client_quotes!job_submissions_accepted_quote_fk(
           client_price_pence, contractor_quote:contractor_quotes(contractor_price_pence)))`,
    )
    .order('created_at', { ascending: false })
    .limit(400);

  // Fold payment rows into jobs, newest job first.
  const jobs = new Map<string, Job>();
  for (const row of data ?? []) {
    const sub = row.submission as unknown as Omit<Job, 'payments'> | null;
    if (!sub) continue;
    const job = jobs.get(sub.id) ?? { ...sub, payments: [] };
    job.payments.push(row as unknown as Payment);
    jobs.set(sub.id, job);
  }

  const all = [...jobs.values()];
  // A job is on the money page once any of its money has arrived.
  const funded = all.filter((j) => j.payments.some((p) => COLLECTED.has(p.status)));
  // Accepted, deposit never paid: not money yet.
  const unfunded = all.filter((j) => !funded.includes(j) && !STOPPED.has(j.status));

  const figures = funded.map((j) => {
    const price = j.quote?.client_price_pence ?? 0;
    const cost = j.quote?.contractor_quote?.contractor_price_pence ?? 0;
    const taken = j.payments.reduce((n, p) => n + collected(p), 0);
    const balance = j.payments.find((p) => p.kind === 'balance');
    const left = STOPPED.has(j.status) ? 0 : Math.max(0, price - taken);
    return { j, price, cost, taken, balance, left, margin: price - cost };
  });

  const taken = figures.reduce((n, f) => n + f.taken, 0);
  const paymentsTaken = funded.reduce((n, j) => n + j.payments.filter((p) => COLLECTED.has(p.status)).length, 0);
  const dueNow = figures.filter((f) => f.balance && ['due', 'failed'].includes(f.balance.status));
  const dueNowPence = dueNow.reduce((n, f) => n + f.left, 0);
  const failed = dueNow.filter((f) => f.balance?.status === 'failed').length;
  const notYetDue = figures.filter((f) => f.left > 0 && !dueNow.includes(f));
  const notYetDuePence = notYetDue.reduce((n, f) => n + f.left, 0);
  const owed = figures.filter((f) => FINISHED.has(f.j.status));
  const owedPence = owed.reduce((n, f) => n + f.cost, 0);
  const owedNoInvoice = owed.filter((f) => !f.j.contractor_invoice_at).length;
  const marginPence = figures.reduce((n, f) => n + f.margin, 0);
  const marginBanked = figures.filter((f) => f.left === 0 && !STOPPED.has(f.j.status)).reduce((n, f) => n + f.margin, 0);

  return (
    <div>
      <h1 className={s.h1}>Money</h1>
      <p className={s.sub}>
        One line per job: what the customer agreed to pay, the two parts it
        arrives in, and what each side is owed. Both sides&rsquo; figures appear
        here and nowhere the contractor or customer can see.
      </p>

      {error && <div className={s.blocked}>Couldn’t load payments: {error.message}</div>}

      <Tiles>
        <Tile
          value={formatGBP(taken)}
          label="Taken so far"
          hint={<>{paymentsTaken} payment{paymentsTaken === 1 ? '' : 's'} on {funded.length} job{funded.length === 1 ? '' : 's'}</>}
        />
        <Tile
          value={formatGBP(dueNowPence + notYetDuePence)}
          label="Still to collect from customers"
          hint={
            <>
              {formatGBP(dueNowPence)} due now
              {failed > 0 ? ` (${failed} failed)` : ''} · {formatGBP(notYetDuePence)} once{' '}
              {notYetDue.length === 1 ? 'the job is' : `${notYetDue.length} jobs are`} signed off
            </>
          }
          warn={failed > 0}
        />
        <Tile
          value={formatGBP(owedPence)}
          label="Owed to contractors"
          hint={
            owed.length === 0 ? (
              'No finished jobs'
            ) : (
              <>
                {owed.length} finished job{owed.length === 1 ? '' : 's'}
                {owedNoInvoice > 0 ? ` · ${owedNoInvoice} without an invoice yet` : ''} · paid by hand
              </>
            )
          }
        />
        <Tile
          value={formatGBP(marginBanked)}
          label="Our margin, fully collected"
          hint={<>{formatGBP(marginPence)} across every job that has paid anything</>}
        />
      </Tiles>

      <div className={s.sectionLabel}>Jobs with money on them</div>
      {figures.length === 0 ? (
        <div className={s.empty}>No payments yet.</div>
      ) : (
        <AdminTable
          head={['Job', 'Status', 'Quote', 'Deposit', 'Balance', 'Left to collect', 'Contractor gets', 'We keep']}
        >
          {figures.map(({ j, price, cost, balance, left, margin }) => {
            const deposit = partLine(j.payments.find((p) => p.kind === 'deposit'), '—');
            const bal = partLine(
              balance,
              STOPPED.has(j.status) ? '—' : `${formatGBP(price - (j.payments.find((p) => p.kind === 'deposit')?.amount_pence ?? 0))} at sign-off`,
            );
            return (
              <tr key={j.id}>
                <td>
                  <Link href={`/admin/submissions/${j.id}`}>
                    {jobName(j)} · {j.contact_name ?? '—'}
                  </Link>
                  {j.contractor && (
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{j.contractor.business_name}</div>
                  )}
                </td>
                <td>{STATUS[j.status] ?? j.status}</td>
                <td>{formatGBP(price)}</td>
                <td title={j.payments.find((p) => p.kind === 'deposit')?.last_error ?? undefined}>
                  {deposit.text}
                  {deposit.sub && <div style={{ fontSize: 12, color: deposit.bad ? 'var(--error)' : 'var(--ink-3)' }}>{deposit.sub}</div>}
                </td>
                <td title={balance?.last_error ?? undefined}>
                  {bal.text}
                  {bal.sub && <div style={{ fontSize: 12, color: bal.bad ? 'var(--error)' : 'var(--ink-3)' }}>{bal.sub}</div>}
                </td>
                <td>{left > 0 ? formatGBP(left) : 'Nothing'}</td>
                <td>{formatGBP(cost)}</td>
                <td>{formatGBP(margin)}</td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {unfunded.length > 0 && (
        <>
          <div className={s.sectionLabel}>Accepted, deposit not paid</div>
          <p className={s.sub} style={{ marginBottom: 12 }}>
            The customer picked a quote and stopped before the card. Nothing has
            been taken; they are chased from the ops board.
          </p>
          <AdminTable head={['Job', 'Quote', 'Deposit', 'Accepted']}>
            {unfunded.map((j) => {
              const dep = j.payments.find((p) => p.kind === 'deposit');
              return (
                <tr key={j.id}>
                  <td>
                    <Link href={`/admin/submissions/${j.id}`}>
                      {jobName(j)} · {j.contact_name ?? '—'}
                    </Link>
                  </td>
                  <td>{formatGBP(j.quote?.client_price_pence ?? 0)}</td>
                  <td>
                    {dep ? formatGBP(dep.amount_pence) : '—'}
                    {dep?.status === 'expired' && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>checkout expired</div>}
                  </td>
                  <td>{dep ? formatDateTime(dep.created_at) : '—'}</td>
                </tr>
              );
            })}
          </AdminTable>
        </>
      )}
    </div>
  );
}
