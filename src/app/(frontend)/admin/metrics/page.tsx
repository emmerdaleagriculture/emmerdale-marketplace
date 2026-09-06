import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { UKCoverageMap } from '@/components/UKCoverageMap';
import { HeatOverlay } from '../reporting/journey/HeatOverlay';
import { fmtSeconds, loadJourney } from '@/lib/journey';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

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
  accepted_awaiting_payment: 'Accepted, awaiting payment',
  awarded: 'Paid & awarded',
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
  const [{ data, error }, start] = await Promise.all([
    admin.rpc('admin_dashboard'),
    loadJourney('/start'),
  ]);
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
  const steps: { key: string; label: string }[] = [
    { key: 'landing_views_30d', label: 'Landing views' },
    { key: 'started_30d', label: 'Started a job' },
    { key: 'confirmed_30d', label: 'Sent it' },
    { key: 'distributed_30d', label: 'Reached contractors' },
    { key: 'priced_30d', label: 'Got a price' },
    { key: 'paid_30d', label: 'Paid' },
    { key: 'completed_30d', label: 'Completed' },
  ];
  const top = fu[steps[0].key] || 0;

  const pipeline = Object.entries(d.pipeline).sort(
    (a, b) => Object.keys(PIPELINE_LABEL).indexOf(a[0]) - Object.keys(PIPELINE_LABEL).indexOf(b[0]),
  );

  // Map: demand. The contractors page already has the supply map.
  const jobsByCounty: Record<string, number> = {};
  for (const c of d.counties) if (c.jobs > 0) jobsByCounty[c.name] = c.jobs;
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
        <Attention count={at.awaiting_customer_confirm} label="awaiting customer confirmation" href="/admin/submissions" />
        <Attention count={at.awaiting_payment} label="accepted, not yet paid" href="/admin/submissions" />
        <Attention count={at.no_quotes_48h} label="no price after 48h" href="/admin/submissions" />
        <Attention count={at.no_matches} label="no contractor covered it" href="/admin/submissions" />
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
            <div key={st.key} className={s.funnelStep}>
              <div className={s.funnelValue}>{n(v)}</div>
              <div className={s.funnelLabel}>{st.label}</div>
              <div className={s.funnelRate}>{i === 0 ? ' ' : `${pct(v, prev)} of previous`}</div>
              <div className={s.funnelBar}>
                <span style={{ width: top > 0 ? `${Math.max(2, (100 * v) / top)}%` : '0%' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className={s.metricGrid}>
        <Metric value={n(fu.confirmed_all)} label="Jobs sent, all time" />
        <Metric value={n(fu.paid_all)} label="Jobs paid, all time" hint={`${pct(fu.paid_all, fu.confirmed_all)} of jobs sent`} />
        <Metric value={n(fu.completed_all)} label="Jobs completed, all time" />
        <Metric value={n(d.unplaced_jobs)} label="Jobs with no county" hint="Could not be routed" />
      </div>

      {/* ── Behaviour on /start ───────────────────────────────────────── */}
      <div className={s.sectionLabel}>Behaviour on /start — last 30 days</div>
      {start.visits === 0 ? (
        <div className={s.empty}>
          No visits recorded yet. The beacon sends when a tab closes, so the first
          numbers appear after real visits end — not while you look at the page
          yourself, and never from inside this overlay.
        </div>
      ) : (
        <div className={s.behaviourRow}>
          {/* Two renders, because they are two different pages: the same
              fraction of the document is a different element at 390px than
              at 1280px. Phone clicks go on the phone render and desktop
              clicks on the desktop one, and each blob scales to its page. */}
          <div className={s.overlayPane}>
            <div className={s.overlayTitle}>
              Phone <span className={s.metricHint}>{n(start.phonePoints.length)} clicks · 390px</span>
            </div>
            <HeatOverlay path="/start" points={start.phonePoints} width={390} scale={0.72} />
          </div>
          <div className={s.overlayPane}>
            <div className={s.overlayTitle}>
              Desktop <span className={s.metricHint}>{n(start.desktopPoints.length)} clicks · 1280px</span>
            </div>
            <HeatOverlay path="/start" points={start.desktopPoints} />
          </div>
          <div>
            <div className={s.metricGrid}>
              <Metric value={n(start.visits)} label="Visits" hint={`${Math.round(100 * start.phoneShare)}% on a phone`} />
              <Metric value={n(start.clicks)} label="Clicks" />
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr><th>Got as far as</th><th>Visits</th><th>Of all</th><th>Of previous</th><th>Median time</th></tr>
                </thead>
                <tbody>
                  {start.milestones.map((m, i) => {
                    const prev = i === 0 ? start.visits : start.milestones[i - 1].visits;
                    return (
                      <tr key={m.key}>
                        <td style={m.error ? { color: '#a02a2a' } : undefined}>{m.label}</td>
                        <td>{n(m.visits)}</td>
                        <td>{pct(m.visits, start.visits)}</td>
                        <td>{m.error ? '—' : pct(m.visits, prev)}</td>
                        <td>{fmtSeconds(m.seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr><th>Scrolled to</th><th>Visits</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {start.bands.map((b) => (
                    <tr key={b.mark}>
                      <td>{b.mark}% of the page</td>
                      <td>{n(b.reached)}</td>
                      <td>{pct(b.reached, start.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.metricHint}>
              Aggregated per visit — a visit is one browser tab and nothing here identifies anyone.{' '}
              <Link href="/admin/reporting/journey?path=%2Fstart">Full journey report</Link>.
            </p>
          </div>
        </div>
      )}

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
      <div className={s.sectionLabel}>Money</div>
      <div className={s.metricGrid}>
        <Metric value={gbp(mo.gross_pence_30d)} label="Taken, 30 days" hint={`${gbp(mo.gross_pence_all)} all time`} />
        <Metric value={gbp(mo.margin_pence_30d)} label="Our margin, 30 days" hint={`${gbp(mo.margin_pence_all)} all time`} />
        <Metric value={gbp(mo.held_pence)} label="Held for contractors" hint="Paid jobs not yet complete" />
        <Metric value={gbp(mo.payouts_owed_pence)} label="Payouts owed" hint="Complete, waiting on us" />
        <Metric value={gbp(mo.avg_job_pence)} label="Average job" />
        <Metric value={gbp(mo.refunded_pence_all)} label="Refunded, all time" />
      </div>

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
      <div className={s.mapCard}>
        <div className={s.mapHead}>
          <span className={s.mapTitle}>Jobs by county</span>
          <span className={s.mapStat}>
            {d.counties.filter((c) => c.jobs > 0).length} counties have had a job ·{' '}
            {d.counties.filter((c) => c.contractors > 0).length} have a vetted contractor ·{' '}
            <Link href="/admin/contractors">coverage map</Link>
          </span>
        </div>
        <div className={s.mapRow}>
          <UKCoverageMap counts={jobsByCounty} className={s.map} pathClassName={s.mapCounty} showCounts />
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
      <div className={s.sectionLabel}>Email, last 7 days</div>
      <div className={s.metricGrid}>
        <Metric value={n(em.sent_7d)} label="Sent" />
        <Metric value={n(em.delivered_7d)} label="Confirmed delivered" hint="Needs the Resend webhook" />
        <Metric value={n(em.bounced_7d)} label="Bounced / failed" />
        <Metric value={n(em.pending)} label="Waiting to send" />
      </div>

      {/* ── Legacy ────────────────────────────────────────────────────── */}
      <div className={s.sectionLabel}>The old board</div>
      <div className={s.empty}>
        {n(d.legacy.board_jobs_open)} open of {n(d.legacy.board_jobs_total)} ever posted. Being retired —{' '}
        <Link href="/admin/jobs">see them</Link>.
      </div>

      <div className={s.sectionLabel}>Quick actions</div>
      <div className={s.quickLinks}>
        <Link href="/admin/submissions" className={f.btnPrimary}>All submissions</Link>
        <Link href="/admin/money" className={f.btnGhost}>Money</Link>
        <Link href="/admin/contractors" className={f.btnGhost}>
          Contractors{co.pending ? ` (${co.pending} pending)` : ''}
        </Link>
        <Link href="/admin/email" className={f.btnGhost}>Email</Link>
        <Link href="/admin/seo" className={f.btnGhost}>Search Console</Link>
      </div>

      <p className={s.metricHint} style={{ marginTop: 24 }}>
        Generated {new Date(d.generated_at).toLocaleString('en-GB')}.
      </p>
    </div>
  );
}
