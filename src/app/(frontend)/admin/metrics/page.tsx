import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import s from '../admin.module.css';

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

function Metric({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className={s.metric}>
      <div className={s.metricValue}>{value}</div>
      <div className={s.metricLabel}>{label}</div>
      {hint && <div className={s.metricHint}>{hint}</div>}
    </div>
  );
}

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
  const { data, error } = await admin.rpc('admin_dashboard');
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
      <div className={s.metricGrid}>
        <Metric value={n(fu.confirmed_all)} label="Jobs sent, all time" />
        <Metric value={n(fu.paid_all)} label="Jobs booked, all time" hint={`deposit paid — ${pct(fu.paid_all, fu.confirmed_all)} of jobs sent`} />
        <Metric value={n(fu.completed_all)} label="Jobs completed, all time" />
        <Metric value={n(d.unplaced_jobs)} label="Jobs with no county" hint="Could not be routed" />
      </div>

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
        <div className={s.metricGrid}>
          {pipeline.map(([status, count]) => (
            <Metric key={status} value={n(count)} label={PIPELINE_LABEL[status] ?? status} />
          ))}
        </div>
      )}

      {/* ── Money ─────────────────────────────────────────────────────── */}
      {/* Taken, "Collected on live jobs" and "Balances outstanding" were the
          same three figures under the same labels as /admin/money. Only what
          that page does not carry stays here. */}
      <div className={s.sectionLabel}>Money</div>
      <div className={s.metricGrid}>
        <Metric value={gbp(mo.margin_pence_30d)} label="Our margin, 30 days" hint={`${gbp(mo.margin_pence_all)} all time`} />
        <Metric value={gbp(mo.payouts_owed_pence)} label="Payouts owed" hint="Complete, waiting on us" />
        <Metric value={gbp(mo.avg_job_pence)} label="Average job" />
        <Metric value={gbp(mo.refunded_pence_all)} label="Refunded, all time" />
      </div>
      <p className={s.metricHint}>
        Taken, held and outstanding are on the <Link href="/admin/money">money page</Link>,
        with every payment behind them.
      </p>

      {/* ── People ────────────────────────────────────────────────────── */}
      <div className={s.two}>
        <div>
          <div className={s.sectionLabel}>Customers</div>
          <div className={s.metricGrid}>
            <Metric value={n(cu.total)} label="Accounts" hint={`${n(cu.new_30d)} new in 30 days`} />
            <Metric value={n(cu.with_a_job)} label="With a job saved" />
            <Metric value={n(cu.repeat)} label="Booked more than once" />
            <Metric value={n(cu.schedules_active)} label="Repeat schedules running" />
            <Metric value={n(cu.unclaimed_jobs)} label="Jobs not on an account" hint="Customer has the link only" />
          </div>
        </div>
        <div>
          <div className={s.sectionLabel}>Contractors</div>
          <div className={s.metricGrid}>
            <Metric value={n(co.vetted)} label="Approved & vetted" hint={`${n(co.approved)} approved · ${n(co.total)} registered`} />
            <Metric value={n(co.pending)} label="Awaiting approval" hint={co.suspended ? `${n(co.suspended)} suspended` : undefined} />
            <Metric value={n(co.new_30d)} label="Joined in 30 days" />
            <Metric value={`${n(co.priced_30d)} / ${n(co.invited_30d)}`} label="Priced / invited, 30 days" hint={`${n(co.won_30d)} won a job`} />
            <Metric value={co.rating_avg == null ? '—' : `${co.rating_avg} ★`} label="Average rating" hint={`${n(co.ratings)} ratings`} />
          </div>
        </div>
      </div>

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>How contractors respond</div>
      <div className={s.metricGrid}>
        <Metric value={re.invite_to_first_price_median_hours == null ? '—' : `${re.invite_to_first_price_median_hours}h`} label="Invite → first price" hint="Median" />
        <Metric value={n(re.invites_per_job)} label="Contractors invited per job" />
        <Metric value={n(re.prices_per_job)} label="Prices per job" />
        <Metric value={re.decline_rate_pct == null ? '—' : `${re.decline_rate_pct}%`} label="Invitations declined" />
      </div>

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
        <div className={s.mapRow}>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>County</th><th>Jobs</th><th>30d</th><th>Customers</th><th>Contractors</th><th>Unmatched</th><th>Taken</th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </table>
            {d.counties.length > 25 && (
              <div className={s.metricHint}>Top 25 by jobs, then by contractors. {d.counties.length} counties have either.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Email ─────────────────────────────────────────────────────── */}
      {/* Was four tiles of what /admin/email shows in full, alongside the
          drain health, the stuck sends and the last thirty messages. */}
      <div className={s.sectionLabel}>Email</div>
      <div className={s.empty}>
        {n(em.sent_7d)} sent in the last 7 days, {n(em.bounced_7d)} bounced or failed,{' '}
        {n(em.pending)} waiting. <Link href="/admin/email">Email page →</Link>
      </div>

      {/* ── Legacy ────────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>The old board</div>
      <div className={s.empty}>
        {n(d.legacy.board_jobs_open)} open of {n(d.legacy.board_jobs_total)} ever posted. Being retired —{' '}
        <Link href="/admin/jobs">see them</Link>.
      </div>

      <p className={s.metricHint} style={{ marginTop: 24 }}>
        Generated {new Date(d.generated_at).toLocaleString('en-GB')}.
      </p>
    </div>
  );
}
