import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles } from '../ui';
import { Fold, Pie, PieCard, type PieSlice } from '../Pie';
import { fetchAll } from '@/lib/supabase/fetchAll';
import {
  groupOf, jobSources, SOURCE_GROUPS,
  type LandingView, type ParseEvent, type SourceSub,
} from '@/lib/jobSources';

export const metadata: Metadata = { title: 'Dashboard — Admin' };
export const dynamic = 'force-dynamic';

/**
 * The dashboard for the model the site runs now.
 *
 * The previous one counted the old board — jobs posted, jobs open, contact
 * opens — none of which is how work moves any more. Everything here comes
 * from one round trip to admin_dashboard(): the funnel from a landing view to
 * a confirmed completion, what is stuck and needs a person, the money in
 * flight, both sides of the marketplace, and where in the country all of it
 * is happening.
 *
 * Reads top to bottom in the order an operator asks: what needs me, how is
 * the funnel, where is the money, who is on the platform, where are they.
 */

type Dashboard = {
  funnel: Record<string, number>;
  pipeline: Record<string, number>;
  attention: Record<string, number>;
  money: Record<string, number>;
  customers: Record<string, number>;
  contractors: Record<string, number | null>;
  response: Record<string, number | null>;
  counties: {
    id: number; name: string; region: string;
    jobs: number; jobs_30d: number; no_matches: number; paid_pence: number;
    contractors: number; customers: number;
  }[];
  unplaced_jobs: number;
  weekly: { week: string; jobs: number; paid: number }[];
  email: Record<string, number>;
  legacy: Record<string, number>;
  generated_at: string;
};

type PrioritySummary = {
  computed_on: string | null;
  standing: Record<string, number>;
  flags_30d: number;
  shadow: Record<string, number | null>;
  visits: Record<string, number>;
};

type MarkupArm = {
  rate: number;
  jobs: number;
  priced: number;
  prices: number;
  booked: number;
  completed: number;
  cancelled: number;
  lapsed: number;
  avg_client_pence: number | null;
  avg_contractor_pence: number | null;
  margin_pence: number;
  median_days_to_book: number | null;
  since: string | null;
};
type MarkupTest = {
  enabled: boolean;
  rates: Partial<Record<'a' | 'b', number>>;
  arms: Partial<Record<'a' | 'b', MarkupArm>>;
  since: string | null;
};

/** An arm with no jobs yet, so the table shows both columns from day one. */
function emptyArm(rate: number): MarkupArm {
  return { rate, jobs: 0, priced: 0, prices: 0, booked: 0, completed: 0, cancelled: 0, lapsed: 0, avg_client_pence: null, avg_contractor_pence: null, margin_pence: 0, median_days_to_book: null, since: null };
}

/**
 * Two-sided p-value for "the two arms book priced jobs at the same rate"
 * (pooled two-proportion z-test). Null until both arms have something to
 * compare. Small samples make this generous rather than strict; it is a
 * reading aid, not a verdict.
 */
function bookingRatePValue(a: MarkupArm, b: MarkupArm): number | null {
  if (a.priced < 5 || b.priced < 5) return null;
  const p1 = a.booked / a.priced, p2 = b.booked / b.priced;
  const p = (a.booked + b.booked) / (a.priced + b.priced);
  const se = Math.sqrt(p * (1 - p) * (1 / a.priced + 1 / b.priced));
  if (se === 0) return null;
  const z = Math.abs(p1 - p2) / se;
  // Φ(z) via the Abramowitz–Stegun erf approximation.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return Math.max(0, Math.min(1, 1 - erf));
}

const PIPELINE_LABEL: Record<string, string> = {
  confirmed: 'Confirmed, not yet sent',
  distributed: 'Out to contractors',
  quotes_receiving: 'Prices coming in',
  accepted_awaiting_payment: 'Accepted, awaiting deposit',
  awarded: 'Deposit paid & awarded',
  contacted: 'Contractor in touch',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Awaiting customer confirmation',
  variation_pending: 'Variation pending',
};

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-GB'));
const gbp = (pence: number | null | undefined) => (pence == null ? '—' : formatGBP(pence));
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((100 * num) / den)}%` : '—');
const nz = (v: number | null | undefined) => Math.max(0, v ?? 0);

function Attention({ count, label, href }: { count: number; label: string; href: string }) {
  return (
    <Link href={href} className={`${s.attentionItem} ${count > 0 ? s.attentionHot : ''}`}>
      <strong>{count}</strong> {label}
    </Link>
  );
}

export default async function AdminDashboard() {
  const admin = createServiceRoleClient();
  // One read now. The behaviour section used to load the whole /start journey
  // here as well, to render a copy of the journey page underneath it.
  // Sources are read row by row, all time: the tables are small, and the
  // early jobs need the IP join in jobSources to say anything at all.
  const page = <T,>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) =>
    fetchAll(q).catch(() => [] as T[]);
  const [{ data, error }, invitations, sourceSubs, parses, views, priorityQ, markupQ] = await Promise.all([
    admin.rpc('admin_dashboard'),
    // Every invitation of the last 30 days, for the response donut: the RPC
    // carries rates, not the split. Paged; the month is past 600 already.
    fetchAll((from, to) =>
      admin
        .from('job_invitations')
        .select('status, opened_at')
        .gte('sent_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString())
        .order('sent_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    ).catch(() => [] as { status: string; opened_at: string | null }[]),
    page<SourceSub>((from, to) =>
      admin
        .from('job_submissions')
        .select('id, created_at, utm_source, utm_medium, gclid, referrer')
        .not('confirmed_at', 'is', null)
        // Hidden = test runs and duplicates, already out of the dashboard.
        .is('hidden_at', null)
        .order('created_at').order('id')
        .range(from, to),
    ),
    page<ParseEvent>((from, to) =>
      admin.from('job_parse_events').select('ip, created_at').eq('action', 'parse').order('id').range(from, to),
    ),
    page<LandingView>((from, to) =>
      admin
        .from('landing_views')
        .select('ip, created_at, utm_source, utm_medium, gclid, referrer')
        .order('id')
        .range(from, to),
    ),
    // Priority Access in the shadows (20261001160000): one jsonb, like the
    // dashboard itself. Its absence must not take the page down.
    admin.rpc('admin_priority_summary').then((r) => r, () => ({ data: null })),
    // The commission split test (20261002100000): the two arms side by side.
    admin.rpc('admin_markup_test_summary').then((r) => r, () => ({ data: null })),
  ]);
  const pr = (priorityQ?.data ?? null) as PrioritySummary | null;
  const mt = (markupQ?.data ?? null) as MarkupTest | null;
  if (error || !data) {
    return (
      <div>
        <h1 className={s.h1}>Dashboard</h1>
        <div className={s.empty}>Could not load the dashboard: {error?.message ?? 'no data'}.</div>
      </div>
    );
  }
  const d = data as unknown as Dashboard;
  const { funnel: fu, money: mo, customers: cu, contractors: co, response: re, attention: at, email: em } = d;

  // The funnel as steps, each with its conversion from the one before. The
  // first step is page views, which the beacon only counts for humans.
  // Each step opens what it counts: views by source, or the jobs themselves.
  const steps: { key: string; label: string; href: string }[] = [
    { key: 'landing_views_30d', label: 'Landing views', href: '/admin/reporting' },
    { key: 'started_30d', label: 'Started a job', href: '/admin/submissions?filter=started' },
    { key: 'confirmed_30d', label: 'Sent it', href: '/admin/submissions?filter=sent' },
    { key: 'distributed_30d', label: 'Reached contractors', href: '/admin/submissions?filter=reached' },
    { key: 'priced_30d', label: 'Got a price', href: '/admin/submissions?filter=priced' },
    { key: 'paid_30d', label: 'Paid', href: '/admin/submissions?filter=paid' },
    { key: 'completed_30d', label: 'Completed', href: '/admin/submissions?filter=completed' },
  ];
  const top = fu[steps[0].key] || 0;

  const pipeline = Object.entries(d.pipeline).sort(
    (a, b) => Object.keys(PIPELINE_LABEL).indexOf(a[0]) - Object.keys(PIPELINE_LABEL).indexOf(b[0]),
  );

  const weeklyMax = Math.max(1, ...d.weekly.map((w) => w.jobs));

  // ── The donuts: one part-to-whole per section ──────────────────────
  const attentionSlices: PieSlice[] = [
    { label: 'Invoices to pay', value: nz(at.invoices_to_pay) },
    { label: 'Awaiting customer confirmation', value: nz(at.awaiting_customer_confirm) },
    { label: 'Accepted, deposit not paid', value: nz(at.awaiting_payment) },
    { label: 'No price after 48h', value: nz(at.no_quotes_48h) },
    { label: 'No contractor covered it', value: nz(at.no_matches) },
    { label: 'Finished, no invoice', value: nz(at.awaiting_invoice) },
    { label: 'Contractors awaiting approval', value: nz(co.pending) },
    { label: 'Emails failed', value: nz(em.failed) },
  ];
  // Where the month's sent jobs stand now. The funnel counts are nested, so
  // each stage is the difference from the next.
  const funnelSlices: PieSlice[] = [
    { label: 'Completed', value: nz(fu.completed_30d) },
    { label: 'Booked, not yet done', value: nz(fu.paid_30d) - nz(fu.completed_30d) },
    { label: 'Priced, not booked', value: nz(fu.priced_30d) - nz(fu.paid_30d) },
    { label: 'Reached contractors, no price', value: nz(fu.distributed_30d) - nz(fu.priced_30d) },
    { label: 'Sent, not yet reached contractors', value: nz(fu.confirmed_30d) - nz(fu.distributed_30d) },
  ];
  const pipelineSlices: PieSlice[] = pipeline.map(([status, count]) => ({
    label: PIPELINE_LABEL[status] ?? status,
    value: nz(count),
  }));
  const moneySlices: PieSlice[] = [
    { label: 'Contractors’ share', value: nz(mo.gross_pence_30d) - nz(mo.margin_pence_30d) },
    { label: 'Our margin', value: nz(mo.margin_pence_30d) },
  ];
  const customerSlices: PieSlice[] = [
    { label: 'On a customer account', value: nz(fu.confirmed_all) - nz(cu.unclaimed_jobs) },
    { label: 'Link only, no account', value: nz(cu.unclaimed_jobs) },
  ];
  const contractorSlices: PieSlice[] = [
    { label: 'Approved & vetted', value: nz(co.vetted) },
    { label: 'Approved, not vetted', value: nz(co.approved) - nz(co.vetted) },
    { label: 'Awaiting approval', value: nz(co.pending) },
    { label: 'Suspended', value: nz(co.suspended) },
    { label: 'Other', value: nz(co.total) - nz(co.approved) - nz(co.pending) - nz(co.suspended) },
  ];
  const inv = { priced: 0, declined: 0, opened: 0, unopened: 0, closed: 0 };
  for (const i of invitations) {
    if (i.status === 'priced') inv.priced += 1;
    else if (i.status === 'declined') inv.declined += 1;
    else if (i.status === 'viewed') inv.opened += 1;
    else if (i.status === 'sent') inv.unopened += 1;
    else inv.closed += 1;
  }
  const responseSlices: PieSlice[] = [
    { label: 'Priced', value: inv.priced },
    { label: 'Passed', value: inv.declined },
    { label: 'Opened, no answer', value: inv.opened },
    { label: 'Not opened', value: inv.unopened },
    { label: 'Job closed before they answered', value: inv.closed },
  ];
  const weeklyPaid = d.weekly.reduce((a, w) => a + nz(w.paid), 0);
  const weeklyJobs = d.weekly.reduce((a, w) => a + nz(w.jobs), 0);
  const weeklySlices: PieSlice[] = [
    { label: 'Paid', value: weeklyPaid },
    { label: 'Sent, not paid', value: weeklyJobs - weeklyPaid },
  ];
  // Jobs by region, the biggest six named and the rest folded together so
  // the ring never needs a ninth colour.
  const byRegion = new Map<string, number>();
  for (const c of d.counties) byRegion.set(c.region, (byRegion.get(c.region) ?? 0) + nz(c.jobs));
  const regions = [...byRegion.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const regionSlices: PieSlice[] = [
    ...regions.slice(0, 6).map(([label, value]) => ({ label, value })),
    ...(regions.length > 6
      ? [{ label: 'Other regions', value: regions.slice(6).reduce((a, [, v]) => a + v, 0) }]
      : []),
  ];
  const emailSlices: PieSlice[] = [
    { label: 'Delivered', value: nz(em.delivered_7d) },
    { label: 'Bounced or failed', value: nz(em.bounced_7d) },
    { label: 'No verdict yet', value: nz(em.sent_7d) - nz(em.delivered_7d) - nz(em.bounced_7d) },
    { label: 'Waiting to send', value: nz(em.pending) },
  ];
  // Where confirmed jobs came from, all time, grouped coarse enough for a
  // donut. The fine channel stays in the folded table underneath.
  const sources = jobSources(sourceSubs, parses, views);
  const since30d = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const sourceSlices: PieSlice[] = SOURCE_GROUPS.map((g) => ({
    label: g,
    value: sources.filter((j) => groupOf(j.channel) === g).length,
  }));
  const recovered = sources.filter((j) => j.recovered).length;
  const byChannel = new Map<string, { all: number; d30: number; recovered: number }>();
  for (const j of sources) {
    const row = byChannel.get(j.channel) ?? { all: 0, d30: 0, recovered: 0 };
    row.all += 1;
    if (j.created_at >= since30d) row.d30 += 1;
    if (j.recovered) row.recovered += 1;
    byChannel.set(j.channel, row);
  }
  const channelRows = [...byChannel.entries()].sort((a, b) => b[1].all - a[1].all);
  const legacySlices: PieSlice[] = [
    { label: 'Open', value: nz(d.legacy.board_jobs_open) },
    { label: 'Closed', value: nz(d.legacy.board_jobs_total) - nz(d.legacy.board_jobs_open) },
  ];

  return (
    <div>
      <h1 className={s.h1}>Dashboard</h1>
      <p className={s.sub}>
        The sealed-price funnel, end to end. Last 30 days unless it says otherwise.
      </p>

      {/* ── Needs a person ────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>Needs attention</div>
      <div className={s.attention}>
        <Attention count={at.invoices_to_pay} label="invoices to pay" href="/admin/money" />
        <Attention count={at.awaiting_customer_confirm} label="awaiting customer confirmation" href="/admin/submissions?filter=awaiting_confirm" />
        <Attention count={at.awaiting_payment} label="accepted, deposit not paid" href="/admin/submissions?filter=awaiting_payment" />
        <Attention count={at.no_quotes_48h} label="no price after 48h" href="/admin/submissions?filter=no_quotes_48h" />
        <Attention count={at.no_matches} label="no contractor covered it" href="/admin/submissions?filter=no_matches" />
        <Attention count={at.awaiting_invoice} label="finished, no invoice yet" href="/admin/money" />
        <Attention count={co.pending ?? 0} label="contractors awaiting approval" href="/admin/contractors" />
        <Attention count={em.failed} label="emails failed to send" href="/admin/email" />
      </div>
      <PieCard title="What needs a person, by kind" slices={attentionSlices} centre="items" empty="Nothing needs attention." />

      {/* ── Funnel ────────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>Funnel — last 30 days</div>
      <div className={s.funnel}>
        {steps.map((st, i) => {
          const v = fu[st.key] || 0;
          const prev = i === 0 ? v : fu[steps[i - 1].key] || 0;
          return (
            <Link key={st.key} href={st.href} className={s.funnelStep}>
              <div className={s.funnelValue}>{n(v)}</div>
              <div className={s.funnelLabel}>{st.label}</div>
              <div className={s.funnelRate}>{i === 0 ? ' ' : `${pct(v, prev)} of previous`}</div>
              <div className={s.funnelBar}>
                <span style={{ width: top > 0 ? `${Math.max(2, (100 * v) / top)}%` : '0%' }} />
              </div>
            </Link>
          );
        })}
      </div>
      <Tiles>
        <Tile value={n(fu.confirmed_all)} label="Jobs sent, all time" />
        <Tile value={n(fu.paid_all)} label="Jobs booked, all time" hint={`deposit paid — ${pct(fu.paid_all, fu.confirmed_all)} of jobs sent`} />
        <Tile value={n(fu.completed_all)} label="Jobs completed, all time" />
        <Tile value={n(d.unplaced_jobs)} label="Jobs with no county" hint="Could not be routed" />
      </Tiles>
      <PieCard title="Jobs sent in the last 30 days, where they stand" slices={funnelSlices} centre="jobs sent" empty="No jobs sent in the last 30 days." />

      {/* ── Sources ───────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>Where jobs came from — all time</div>
      <PieCard title="Jobs sent, by where the customer came from" slices={sourceSlices} centre="jobs sent" empty="No jobs sent yet." />
      <Fold summary={`By channel, in a table (${channelRows.length} channels)`}>
        <AdminTable head={['Channel', 'Jobs', '30d', 'Traced by IP']}>
          {channelRows.map(([channel, r]) => (
            <tr key={channel}>
              <td>{channel}<span className={s.metricHint}> {groupOf(channel)}</span></td>
              <td>{n(r.all)}</td>
              <td>{r.d30 > 0 ? n(r.d30) : '—'}</td>
              <td>{r.recovered > 0 ? n(r.recovered) : '—'}</td>
            </tr>
          ))}
        </AdminTable>
      </Fold>
      <p className={s.metricHint}>
        {n(recovered)} of {n(sources.length)} jobs carried no usable source of their own (mostly
        before 26 Sept, when the homepage hand-off overwrote it) and were traced through the
        visitor&rsquo;s earlier landing views. &ldquo;Unknown&rdquo; is what that could not
        recover, including everything before 13 Sept, when landing views start.{' '}
        <Link href="/admin/reporting/sources">Sources page →</Link>
      </p>

      {/* ── Behaviour on /start ───────────────────────────────────────── */}
      {/* The click heat, scroll depth and milestone tables used to be
          re-rendered here in full, importing HeatOverlay from the journey
          page and then linking to that page underneath — the dashboard
          showing you a page it was also telling you to go and look at.
          It lives in one place now. */}
      <div className={s.sectionLabel}>Behaviour on /start</div>
      <div className={s.empty}>
        Click heat, scroll depth and milestones for the landing page:{' '}
        <Link href="/admin/reporting/journey?path=%2Fstart">journey report →</Link>
      </div>

      {/* ── Live pipeline ─────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>In flight right now</div>
      {pipeline.length === 0 ? (
        <div className={s.empty}>Nothing in progress.</div>
      ) : (
        <Tiles>
          {pipeline.map(([status, count]) => (
            <Tile key={status} value={n(count)} label={PIPELINE_LABEL[status] ?? status} />
          ))}
      </Tiles>
      )}
      <PieCard title="In flight, by stage" slices={pipelineSlices} centre="jobs" empty="Nothing in progress." />

      {/* ── Money ─────────────────────────────────────────────────────── */}
      {/* Taken, "Collected on live jobs" and "Balances outstanding" were the
          same three figures under the same labels as /admin/money. Only what
          that page does not carry stays here. */}
      <div className={s.sectionLabel}>Money</div>
      <Tiles>
        <Tile value={gbp(mo.margin_pence_30d)} label="Our margin, 30 days" hint={`${gbp(mo.margin_pence_all)} all time`} />
        <Tile value={gbp(mo.payouts_owed_pence)} label="Payouts owed" hint="Complete, waiting on us" />
        <Tile value={gbp(mo.avg_job_pence)} label="Average job" />
        <Tile value={gbp(mo.refunded_pence_all)} label="Refunded, all time" />
      </Tiles>
      <PieCard
        title="Taken in the last 30 days, split"
        slices={moneySlices}
        format={(v) => formatGBP(v)}
        total={gbp(mo.gross_pence_30d)}
        centre="taken"
        empty="Nothing taken in the last 30 days."
      />
      <p className={s.metricHint}>
        Taken, held and outstanding are on the <Link href="/admin/money">money page</Link>,
        with every payment behind them.
      </p>

      {/* ── People ────────────────────────────────────────────────────── */}
      <div className={s.two}>
        <div>
          <div className={s.sectionLabel}>Customers</div>
          <Tiles>
            <Tile value={n(cu.total)} label="Accounts" hint={`${n(cu.new_30d)} new in 30 days`} />
            <Tile value={n(cu.with_a_job)} label="With a job saved" />
            <Tile value={n(cu.repeat)} label="Booked more than once" />
            <Tile value={n(cu.schedules_active)} label="Repeat schedules running" />
            <Tile value={n(cu.unclaimed_jobs)} label="Jobs not on an account" hint="Customer has the link only" />
          </Tiles>
          <PieCard title="Jobs sent, by whether the customer has an account" slices={customerSlices} centre="jobs" />
        </div>
        <div>
          <div className={s.sectionLabel}>Contractors</div>
          <Tiles>
            <Tile value={n(co.vetted)} label="Approved & vetted" hint={`${n(co.approved)} approved · ${n(co.total)} registered`} />
            <Tile value={n(co.pending)} label="Awaiting approval" hint={co.suspended ? `${n(co.suspended)} suspended` : undefined} />
            <Tile value={n(co.new_30d)} label="Joined in 30 days" />
            <Tile value={`${n(co.priced_30d)} / ${n(co.invited_30d)}`} label="Priced / invited, 30 days" hint={`${n(co.won_30d)} won a job`} />
            <Tile value={co.rating_avg == null ? '—' : `${co.rating_avg} ★`} label="Average rating" hint={`${n(co.ratings)} ratings`} />
          </Tiles>
          <PieCard title="Registered contractors, by standing" slices={contractorSlices} centre="registered" />
        </div>
      </div>

      {/* ── Commission split test ────────────────────────────────────── */}
      {mt && (mt.enabled || mt.arms.a || mt.arms.b) && (() => {
        const a = mt.arms.a ?? (mt.rates.a != null ? emptyArm(mt.rates.a) : undefined);
        const b = mt.arms.b ?? (mt.rates.b != null ? emptyArm(mt.rates.b) : undefined);
        const arms = [a, b].filter((x): x is MarkupArm => Boolean(x));
        const rate = (x: MarkupArm) => pct(x.booked, x.priced);
        const pv = a && b ? bookingRatePValue(a, b) : null;
        const row = (label: string, f: (x: MarkupArm) => React.ReactNode) => (
          <tr key={label}>
            <td>{label}</td>
            {arms.map((x) => <td key={x.rate}>{f(x)}</td>)}
          </tr>
        );
        return (
          <>
            <div className={s.sectionLabel}>
              Commission split test{mt.enabled ? '' : ' — paused'}
              {mt.since ? ` · since ${new Date(mt.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            <p className={s.sub}>
              Each job is put in an arm when its first price is published, and every price on it carries that rate.
              Extra work and repeats inherit the parent job&rsquo;s arm. Jobs priced before the test stay at 10% and are not counted.
              {pv != null
                ? ` On booking rate, the chance the arms are really the same is ${pv < 0.001 ? 'under 0.1%' : `${Math.round(pv * 100)}%`}${pv < 0.05 ? ' — a difference you can act on' : ' — not enough to call yet'}.`
                : ' A reading on booking rate needs at least five priced jobs in each arm.'}
            </p>
            <AdminTable head={['', ...arms.map((x) => `${Math.round(x.rate * 100)}% commission`)]}>
              {row('Jobs in the arm', (x) => n(x.jobs))}
              {row('Priced', (x) => `${n(x.priced)} (${n(x.prices)} prices)`)}
              {row('Booked', (x) => (x.priced ? `${n(x.booked)} — ${rate(x)} of priced` : '0'))}
              {row('Completed', (x) => n(x.completed))}
              {row('Cancelled / lapsed', (x) => `${n(x.cancelled)} / ${n(x.lapsed)}`)}
              {row('Average booked price (customer)', (x) => gbp(x.avg_client_pence))}
              {row('Average booked price (contractor)', (x) => gbp(x.avg_contractor_pence))}
              {row('Our margin on bookings', (x) => gbp(x.margin_pence))}
              {row('Median days from first price to booking', (x) => (x.median_days_to_book == null ? '—' : `${x.median_days_to_book}`))}
            </AdminTable>
          </>
        );
      })()}

      {/* ── Priority Access, in the shadows ──────────────────────────── */}
      {pr && (
        <>
          <div className={s.sectionLabel}>
            Priority Access — shadow run · <Link href="/admin/priority">full picture</Link>
          </div>
          <Tiles>
            <Tile
              value={`${n(pr.standing.priority)} / ${n(pr.standing.responsive)} / ${n(pr.standing.standard)}`}
              label="Priority / Responsive / Standard"
              hint={pr.computed_on ? `standing as of ${pr.computed_on}` : 'not computed yet'}
            />
            <Tile value={n(pr.standing.watch)} label="On watch" hint={`contact without bookings · ${n(pr.standing.contacting)} contractors in contact`} warn={nz(pr.standing.watch) > 0} />
            <Tile value={n(pr.standing.unclean)} label="Standing lost" hint={`${n(pr.flags_30d)} refused messages or notes in 30 days`} warn={nz(pr.standing.unclean) > 0} />
            <Tile
              value={pct(nz(pr.shadow.with_priority), nz(pr.shadow.jobs))}
              label="Jobs with a Priority contractor in range"
              hint={`${n(pr.shadow.jobs)} jobs in 30 days · ${pct(nz(pr.shadow.with_any), nz(pr.shadow.jobs))} with Priority or Responsive`}
            />
            <Tile
              value={pct(nz(pr.shadow.held_back), nz(pr.shadow.priced))}
              label="First prices the window would hold back"
              hint={pr.shadow.avg_delay_h != null ? `by ${pr.shadow.avg_delay_h}h on average · ${pct(nz(pr.shadow.standard_only), nz(pr.shadow.priced))} priced by Standard only` : undefined}
              warn={nz(pr.shadow.held_back) > nz(pr.shadow.priced) / 2}
            />
            <Tile
              value={nz(pr.shadow.booked) ? `${n(pr.shadow.booked_from_tier)} of ${n(pr.shadow.booked)}` : '—'}
              label="Bookings from Priority or Responsive"
              hint={`${pct(nz(pr.shadow.first_from_tier), nz(pr.shadow.priced))} of first prices came from them`}
            />
            <Tile
              value={`${n(pr.visits.agreed)} / ${n(pr.visits.proposed)}`}
              label="Site visits agreed / suggested, 30 days"
              hint={`${n(pr.visits.upcoming)} upcoming · ${n(pr.visits.held)} took place · ${n(pr.visits.declined)} declined · ${n(pr.visits.called_off)} called off`}
            />
            <Tile
              value={nz(pr.visits.held) ? `${n(pr.visits.held_then_booked)} of ${n(pr.visits.held)}` : '—'}
              label="Visits that became a booking"
              hint="took place, then booked with that contractor"
            />
          </Tiles>
        </>
      )}

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>How contractors respond</div>
      <Tiles>
        <Tile value={re.invite_to_first_price_median_hours == null ? '—' : `${re.invite_to_first_price_median_hours}h`} label="Invite → first price" hint="Median" />
        <Tile value={n(re.invites_per_job)} label="Contractors invited per job" />
        <Tile value={n(re.prices_per_job)} label="Prices per job" />
        <Tile value={re.decline_rate_pct == null ? '—' : `${re.decline_rate_pct}%`} label="Invitations declined" />
      </Tiles>
      <PieCard title="Invitations sent in the last 30 days, by outcome" slices={responseSlices} centre="invitations" empty="No invitations in the last 30 days." />

      {/* ── Trend ─────────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>Jobs per week — last 12 weeks</div>
      <div className={s.weeks}>
        {d.weekly.map((w) => {
          const date = new Date(w.week);
          return (
            <div key={w.week} className={s.week} title={`w/c ${date.toLocaleDateString('en-GB')}: ${w.jobs} sent, ${w.paid} paid`}>
              <span className={s.weekJobs} style={{ height: `${(100 * w.jobs) / weeklyMax}%` }} />
              <span className={s.weekPaid} style={{ height: `${(100 * w.paid) / weeklyMax}%` }} />
              <div className={s.weekLabel}>{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
            </div>
          );
        })}
      </div>
      <div className={s.legend}>
        <span style={{ ['--swatch' as string]: 'var(--jd-green-pale)' }}>Sent</span>
        <span style={{ ['--swatch' as string]: 'var(--jd-green-dark)' }}>Paid</span>
      </div>
      <PieCard title="Across the 12 weeks" slices={weeklySlices} centre="jobs sent" empty="No jobs in the last 12 weeks." />

      {/* ── Locations ─────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>Where the work is</div>
      {/* The choropleth moved to /admin/coverage, which now draws all three
          views. This page linked to a third map on the contractors page and
          called it "coverage map" — a fourth name for the same idea. The
          table stays: it is the only place these columns appear. */}
      <div className={s.mapCard}>
        <div className={s.mapHead}>
          <span className={s.mapTitle}>Jobs by county</span>
          <span className={s.mapStat}>
            {d.counties.filter((c) => c.jobs > 0).length} counties have had a job ·{' '}
            {d.counties.filter((c) => c.contractors > 0).length} have a vetted contractor ·{' '}
            <Link href="/admin/coverage?view=jobs">on the map</Link>
          </span>
        </div>
        <Pie slices={regionSlices} centre="jobs, by region" empty="No jobs yet." />
        {/* The table folds: it is 25 rows and the donut above says the shape. */}
        <Fold summary={`${d.counties.length > 25 ? 'Top 25 counties' : `All ${d.counties.length} counties`}, in a table`}>
        <div className={s.mapRow}>
          <div>
            <AdminTable head={['County', 'Jobs', '30d', 'Customers', 'Contractors', 'Unmatched', 'Taken']}>
              {d.counties.slice(0, 25).map((c) => {
                // Demand with nobody to send it to is the row to act on.
                const gap = c.jobs > 0 && c.contractors === 0;
                return (
                  <tr key={c.id} className={gap ? s.gapRow : undefined}>
                    <td>{c.name}<span className={s.metricHint}> {c.region}</span></td>
                    <td>{n(c.jobs)}</td>
                    <td>{n(c.jobs_30d)}</td>
                    <td>{n(c.customers)}</td>
                    <td>{n(c.contractors)}</td>
                    <td>{c.no_matches > 0 ? n(c.no_matches) : '—'}</td>
                    <td>{c.paid_pence > 0 ? gbp(c.paid_pence) : '—'}</td>
                  </tr>
                );
              })}
            </AdminTable>
            {/* The caption sits outside the scroll box, so it stays put
                while the table scrolls sideways. */}
            {d.counties.length > 25 && (
              <div className={s.metricHint}>Top 25 by jobs, then by contractors. {d.counties.length} counties have either.</div>
            )}
          </div>
        </div>
        </Fold>
      </div>

      {/* ── Email ─────────────────────────────────────────────────────── */}
      {/* Was four tiles of what /admin/email shows in full, alongside the
          drain health, the stuck sends and the last thirty messages. */}
      <div className={s.sectionLabel}>Email</div>
      <div className={s.empty}>
        {n(em.sent_7d)} sent in the last 7 days, {n(em.bounced_7d)} bounced or failed,{' '}
        {n(em.pending)} waiting. <Link href="/admin/email">Email page →</Link>
      </div>
      <PieCard title="Last 7 days, by what happened" slices={emailSlices} centre="emails" empty="No email in the last 7 days." />

      {/* ── Legacy ────────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>The old board</div>
      <div className={s.empty}>
        {n(d.legacy.board_jobs_open)} open of {n(d.legacy.board_jobs_total)} ever posted. Being retired —{' '}
        <Link href="/admin/jobs">see them</Link>.
      </div>
      <PieCard title="The old board, open against closed" slices={legacySlices} centre="posted" />

      <p className={s.metricHint} style={{ marginTop: 24 }}>
        Generated {new Date(d.generated_at).toLocaleString('en-GB')}.
      </p>
    </div>
  );
}
