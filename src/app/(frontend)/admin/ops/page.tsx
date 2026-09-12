import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dwell, formatDate, timeLeft } from '@/lib/time';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { OPS_THRESHOLDS_MS, type OpsState } from '@/lib/sealedQuotes/opsThresholds';
import s from '../admin.module.css';
import o from './ops.module.css';

export const metadata: Metadata = { title: 'Ops — Admin' };
export const dynamic = 'force-dynamic';

/**
 * The live operations board (spec v1.6 §30 view 1) — the screen the business
 * runs on. Every open job, grouped into five lanes, overdue first then oldest
 * dwell, each row carrying what's needed to act without opening it: customer
 * and phone, outreach (invited / opened / priced), prices, deposit and balance,
 * the winning contractor, the clock against its threshold, and the next step.
 *
 * Data is admin_submission_board() filtered to the open states — one query,
 * aggregated in SQL. Thresholds live in opsThresholds.ts.
 */

type Job = {
  id: string;
  created_at: string;
  status: OpsState;
  raw_text: string;
  service_verbatim: string | null;
  postcode: string | null;
  target_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  confirmed_at: string | null;
  distributed_at: string | null;
  expires_at: string | null;
  entered_at: string | null;
  service: string | null;
  county: string | null;
  awarded_to: string | null;
  awarded_phone: string | null;
  invited: number;
  opened: number;
  priced: number;
  declined: number;
  emails_failed: number;
  quotes_live: number;
  lowest_client_pence: number | null;
  accepted_pence: number | null;
  deposit_status: string | null;
  deposit_pence: number | null;
  balance_status: string | null;
  balance_pence: number | null;
  balance_due_at: string | null;
};

type Tone = 'open' | 'good' | 'bad';

const LANES: { key: string; title: string; tone: Tone; states: OpsState[] }[] = [
  { key: 'quoting', title: 'Getting prices', tone: 'open', states: ['confirmed', 'distributed', 'quotes_receiving'] },
  { key: 'deposit', title: 'Awaiting deposit', tone: 'open', states: ['accepted_awaiting_payment'] },
  { key: 'delivery', title: 'Awarded & on site', tone: 'good', states: ['awarded', 'contacted', 'scheduled', 'in_progress'] },
  { key: 'signoff', title: 'Awaiting sign-off', tone: 'good', states: ['completed_by_contractor'] },
  { key: 'issues', title: 'Issues', tone: 'bad', states: ['disputed', 'variation_pending', 'variation_declined'] },
];
const OPEN_STATES = LANES.flatMap((l) => l.states);

/** Label, the normal next step, and what to do once past the threshold. */
const STATE: Record<OpsState, [label: string, next: string, late: string]> = {
  confirmed: ['Confirmed', 'Sending to contractors', 'Not sent after 15 min — distribute it from the job page'],
  distributed: ['With contractors', 'Waiting for the first price', 'No prices after 48h — chase contractors'],
  quotes_receiving: ['Prices in', 'Customer is choosing', ''],
  accepted_awaiting_payment: ['Accepted', 'Waiting for the deposit', 'Deposit unpaid after 12h — nudge the customer'],
  awarded: ['Awarded', 'Contractor to contact the customer', 'No contact after 24h — call the contractor'],
  contacted: ['Contacted', 'Contractor and customer in touch', ''],
  scheduled: ['Scheduled', 'Booked in', 'Past its date and not started — check in'],
  in_progress: ['On site', 'Work under way', ''],
  completed_by_contractor: ['Marked done', 'Customer to confirm completion', 'Unconfirmed for 3 days — nudge the customer'],
  disputed: ['Disputed', 'Resolve the dispute', 'Dispute open over 4h — resolve it'],
  variation_pending: ['Variation', 'Customer to approve the variation', 'Variation waiting over 4h — chase it'],
  variation_declined: ['Variation declined', 'Decide the next step', 'Declined over 4h ago — decide the next step'],
};

const DAY = 24 * 60 * 60 * 1000;

/** "12m", "38h", "2d 4h" from milliseconds. */
function span(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function clip(text: string, n: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const tel = (phone: string) => `tel:${phone.replace(/\s+/g, '')}`;

const PAYMENT_WORDS: Record<string, string> = {
  pending: 'link sent',
  due: 'due',
  paid: 'paid',
  expired: 'link expired',
  failed: 'failed',
  refunded: 'refunded',
  partially_refunded: 'part refunded',
};

type Fact = { text: React.ReactNode; tone?: 'warn' | 'good'; key: string };

function facts(j: Job, now: number): Fact[] {
  const out: Fact[] = [];
  const quoting = j.status === 'confirmed' || j.status === 'distributed' || j.status === 'quotes_receiving';

  if (quoting) {
    out.push({
      key: 'reach',
      text: `${j.invited} invited · ${j.opened} opened · ${j.priced} priced${j.declined ? ` · ${j.declined} passed` : ''}`,
    });
    if (j.emails_failed > 0) out.push({ key: 'bounce', tone: 'warn', text: `${j.emails_failed} email${j.emails_failed === 1 ? '' : 's'} failed` });
    out.push(
      j.quotes_live > 0
        ? { key: 'prices', tone: 'good', text: `${j.quotes_live} price${j.quotes_live === 1 ? '' : 's'} from ${formatGBP(j.lowest_client_pence ?? 0)}` }
        : { key: 'prices', text: 'No prices yet' },
    );
    if (j.expires_at) {
      const closingDry = new Date(j.expires_at).getTime() - now < DAY && j.quotes_live === 0;
      out.push({ key: 'exp', tone: closingDry ? 'warn' : undefined, text: `Closes: ${timeLeft(j.expires_at)}` });
    }
  }

  if (j.accepted_pence != null) out.push({ key: 'acc', text: `Accepted ${formatGBP(j.accepted_pence)}` });

  if (j.awarded_to) {
    out.push({
      key: 'won',
      text: (
        <>
          {j.awarded_to}
          {j.awarded_phone && (
            <>
              {' · '}
              <a href={tel(j.awarded_phone)}>{j.awarded_phone}</a>
            </>
          )}
        </>
      ),
    });
  }

  if (j.deposit_status && !quoting) {
    out.push({
      key: 'dep',
      tone: j.deposit_status === 'paid' ? 'good' : j.deposit_status === 'failed' || j.deposit_status === 'expired' ? 'warn' : undefined,
      text: `Deposit${j.deposit_pence != null ? ` ${formatGBP(j.deposit_pence)}` : ''} ${PAYMENT_WORDS[j.deposit_status] ?? j.deposit_status}`,
    });
  }
  if (j.balance_status) {
    out.push({
      key: 'bal',
      tone: j.balance_status === 'paid' ? 'good' : j.balance_status === 'failed' ? 'warn' : undefined,
      text: `Balance${j.balance_pence != null ? ` ${formatGBP(j.balance_pence)}` : ''} ${PAYMENT_WORDS[j.balance_status] ?? j.balance_status}${
        j.balance_status === 'due' && j.balance_due_at ? ` ${formatDate(j.balance_due_at)}` : ''
      }`,
    });
  }
  if (j.target_date && !quoting) out.push({ key: 'date', text: `Target ${formatDate(j.target_date)}` });

  return out;
}

export default async function OpsPage() {
  const admin = createServiceRoleClient();

  const [{ data, error }, { data: config }] = await Promise.all([
    admin.rpc('admin_submission_board', { p_limit: 500, p_statuses: OPEN_STATES }),
    admin.from('app_config').select('value').eq('key', 'sq_test_contractor_allowlist').maybeSingle(),
  ]);
  const testMode = Array.isArray(config?.value) && config.value.length > 0;

  const now = Date.now();
  const jobs = ((data ?? []) as unknown as Job[]).map((j) => {
    const entered =
      j.entered_at ?? (j.status === 'confirmed' ? j.confirmed_at : null) ?? j.distributed_at ?? j.created_at;
    const elapsed = now - new Date(entered).getTime();
    const threshold = OPS_THRESHOLDS_MS[j.status] ?? null;
    const overdue = threshold != null && elapsed > threshold;
    return { ...j, entered, elapsed, threshold, overdue };
  });

  const lanes = LANES.map((lane) => ({
    ...lane,
    jobs: jobs
      .filter((j) => lane.states.includes(j.status))
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.elapsed - a.elapsed),
  }));

  const overdue = jobs.filter((j) => j.overdue).length;
  const closingDry = jobs.filter(
    (j) => j.expires_at && ['distributed', 'quotes_receiving'].includes(j.status) &&
      j.quotes_live === 0 && new Date(j.expires_at).getTime() - now < DAY,
  ).length;
  const paymentProblems = jobs.filter(
    (j) => j.deposit_status === 'failed' || j.balance_status === 'failed',
  ).length;
  const bounced = jobs.filter((j) => j.emails_failed > 0).length;

  const attention: [string, number, string][] = [
    ['Overdue', overdue, lanes.find((l) => l.jobs.some((j) => j.overdue))?.key ?? 'quoting'],
    ['Closing with no prices', closingDry, 'quoting'],
    ['Awaiting deposit', lanes[1].jobs.length, 'deposit'],
    ['Payment failed', paymentProblems, 'delivery'],
    ['Jobs with failed emails', bounced, 'quoting'],
    ['Issues', lanes[4].jobs.length, 'issues'],
  ];

  return (
    <div>
      <h1 className={s.h1}>Operations</h1>
      <p className={s.sub}>
        {jobs.length} open job{jobs.length === 1 ? '' : 's'}. Overdue first, then longest waiting.
      </p>

      {testMode && (
        <div className={o.testBanner}>
          TEST MODE — invitations restricted to the allowlist. Real contractors
          receive nothing. Clear <code>sq_test_contractor_allowlist</code> in
          app_config to go live.
        </div>
      )}
      {error && <div className={s.blocked}>Couldn’t load the board: {error.message}</div>}

      <div className={s.attention}>
        {attention.map(([label, n, anchor]) => (
          <a
            key={label}
            href={`#${anchor}`}
            className={`${s.attentionItem} ${n > 0 && label !== 'Awaiting deposit' ? s.attentionHot : ''} ${n === 0 ? o.zero : ''}`}
          >
            <strong>{n}</strong> {label}
          </a>
        ))}
      </div>

      <nav className={o.lanes} aria-label="Stages">
        {lanes.map((l) => (
          <a key={l.key} href={`#${l.key}`} className={`${o.lane} ${l.jobs.length === 0 ? `${o.laneEmpty} ${o.zero}` : ''}`}>
            {l.title} <b>{l.jobs.length}</b>
          </a>
        ))}
      </nav>

      {jobs.length === 0 && !error && (
        <div className={s.empty} style={{ marginTop: 24 }}>Nothing open — the board is clear.</div>
      )}

      {lanes
        .filter((l) => l.jobs.length > 0)
        .map((lane) => (
          <section key={lane.key} id={lane.key}>
            <h2 className={s.sectionLabel}>
              {lane.title} ({lane.jobs.length})
            </h2>
            <ul className={o.list}>
              {lane.jobs.map((j) => {
                const [label, next, late] = STATE[j.status];
                const title = j.service ?? clip(j.service_verbatim ?? j.raw_text, 70);
                const district = j.postcode?.split(' ')[0];
                return (
                  <li key={j.id} className={`${o.row} ${j.overdue ? o.rowLate : ''}`}>
                    <div className={o.main}>
                      <div className={o.top}>
                        <span className={`${o.state} ${o[lane.tone]}`}>{label}</span>
                        <Link href={`/admin/submissions/${j.id}`} className={o.title}>
                          {title}
                        </Link>
                      </div>
                      <div className={o.meta}>
                        <span>{[j.county, district].filter(Boolean).join(' · ') || '—'}</span>
                        {j.contact_name && <span>{j.contact_name}</span>}
                        {j.contact_phone && <a href={tel(j.contact_phone)}>{j.contact_phone}</a>}
                      </div>
                      <div className={o.facts}>
                        {facts(j, now).map((f) => (
                          <span
                            key={f.key}
                            className={`${o.fact} ${f.tone === 'warn' ? o.factWarn : f.tone === 'good' ? o.factGood : ''}`}
                          >
                            {f.text}
                          </span>
                        ))}
                      </div>
                      <div className={j.overdue && late ? o.nextLate : o.next}>
                        → {j.overdue && late ? late : next}
                      </div>
                    </div>
                    <div className={o.side}>
                      <div className={o.clock}>{dwell(j.entered)}</div>
                      <div className={o.clockLabel}>
                        {j.threshold == null
                          ? 'in this stage'
                          : j.overdue
                            ? `overdue by ${span(j.elapsed - j.threshold)}`
                            : `flags in ${span(j.threshold - j.elapsed)}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
