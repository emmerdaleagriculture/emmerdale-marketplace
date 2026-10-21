import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { membershipOf } from '@/lib/membership';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import { isAppRequest } from '@/lib/appMode.server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import a from '../../auth.module.css';
import ac from '../account.module.css';
import s from './market.module.css';

export const metadata: Metadata = {
  title: 'Market data',
  robots: { index: false, follow: false },
};

/** What sq_market_data returns (migration 20261021120000). */
type MarketData = {
  since: string;
  min_others: number;
  months: { month: string; jobs: number; invited: number }[];
  services: {
    service: string;
    jobs: number;
    prices: number;
    contractors: number;
    median: number | null;
    won: number;
  }[];
  mine: { invited: number; priced: number; won: number };
  field: { priced: number; won: number };
};

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09" → "Sep". */
function monthShort(ym: string): string {
  const m = Number(ym.split('-')[1]);
  return MONTH[(m || 1) - 1] ?? ym;
}
function monthLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH[(m ?? 1) - 1]} ${y}`;
}
function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}
/** The top of the chart: an even number a little above the tallest bar,
 *  so the half-way gridline is a whole number too. */
function gridMax(max: number): number {
  if (max <= 4) return 4;
  if (max <= 20) return Math.ceil(max / 2) * 2;
  if (max <= 100) return Math.ceil(max / 10) * 10;
  return Math.ceil(max / 50) * 50;
}

/**
 * An Open member's market: the jobs on their patch over the last twelve
 * months, what each kind of work went for, and how often their prices
 * win against the field. Everyone else gets the pitch and a link to
 * membership. The figures come from sq_market_data, read with the service
 * role once the tier is confirmed here, like the rest of what Open shows.
 */
export default async function MarketDataPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/market');

  const [{ data: contractor }, { data: sub }] = await Promise.all([
    supabase
      .from('contractors')
      .select('id, business_name, status, premium_comped_until, open_comped_until')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status, plan, tier, current_period_end, cancel_at_period_end')
      .eq('contractor_id', user.id)
      .maybeSingle(),
  ]);
  if (!contractor && isAdminEmail(user.email)) redirect('/admin');
  if (!contractor) redirect(await nonContractorPath(user.id));

  const isOpen = membershipOf(sub, contractor) === 'open' && contractor.status === 'approved';
  // Store rules: in the app, membership is never sold or pointed at
  // (account/page.tsx, membership/page.tsx), so the pitch there says only
  // what the page is.
  const app = await isAppRequest();
  // Market data is an Open benefit. In the app a non-Open contractor is
  // sent back to Earnings rather than shown what Open would give them.
  if (app && !isOpen) redirect('/app/earnings');
  let data: MarketData | null = null;
  if (isOpen) {
    const { data: raw, error } = await createServiceRoleClient().rpc('sq_market_data', { p_contractor_id: user.id });
    if (error) console.error('sq_market_data failed', { contractor: user.id, error: error.message });
    data = (raw as MarketData | null) ?? null;
  }

  const areaJobs = data ? data.months.reduce((n, m) => n + m.jobs, 0) : 0;
  const reached = data ? data.months.reduce((n, m) => n + m.invited, 0) : 0;
  const maxJobs = data ? Math.max(0, ...data.months.map((m) => m.jobs)) : 0;
  const top = gridMax(maxJobs);
  const peakIdx = data ? data.months.findIndex((m) => m.jobs === maxJobs && maxJobs > 0) : -1;
  const lastIdx = data ? data.months.length - 1 : -1;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Market data' }]}
          />
          <div className={a.eyebrow}>{contractor.business_name}</div>
          <h1 className={a.title}>Market data</h1>

          {!isOpen ? (
            <>
              <p className={s.lead}>
                <b>Open members see their patch in numbers.</b> How many jobs came in each
                month across the counties you cover, what each kind of work went for, and how
                often your prices win against everyone else’s.
              </p>
              {app ? (
                <div className={s.pitch}>
                  <h2>Part of Open membership</h2>
                  <p>Open members see this page. Yours is a {membershipOf(sub, contractor) === 'premium' ? 'Premium' : 'Free'} account.</p>
                </div>
              ) : (
                <div className={s.pitch}>
                  <h2>Part of Open membership</h2>
                  <p>
                    Open is £49 a month or £399 a year, and includes first look at every new job,
                    the customer’s contact details on every invitation, 5% commission and a listing
                    in Find a contractor.
                  </p>
                  <Link href="/account/membership">See the membership tiers →</Link>
                </div>
              )}
            </>
          ) : !data ? (
            <p className={s.lead}>
              The figures aren’t available just now. Please try again in a few minutes.
            </p>
          ) : (
            <>
              <p className={s.lead}>
                Your patch is the counties you cover, within reach of your base, over the last
                twelve months. <b>{areaJobs}</b> {areaJobs === 1 ? 'job' : 'jobs'} came in;{' '}
                <b>{reached}</b> reached you.
              </p>

              <div className={ac.tiles}>
                <div className={ac.tile}>
                  <span className={ac.tileValue}>{areaJobs}</span>
                  <span className={ac.tileLabel}>Jobs on your patch</span>
                  <span className={ac.tileHint}>{pct(reached, areaJobs)} reached you</span>
                </div>
                <div className={ac.tile}>
                  <span className={ac.tileValue}>{data.mine.priced}</span>
                  <span className={ac.tileLabel}>You priced</span>
                  <span className={ac.tileHint}>of {data.mine.invited} invitations</span>
                </div>
                <div className={ac.tile}>
                  <span className={ac.tileValue}>{data.mine.won}</span>
                  <span className={ac.tileLabel}>You won</span>
                  <span className={ac.tileHint}>
                    {data.mine.priced > 0 ? `${pct(data.mine.won, data.mine.priced)} of what you priced` : 'Price a job to start'}
                  </span>
                </div>
                <div className={ac.tile}>
                  <span className={ac.tileValue}>{pct(data.field.won, data.field.priced)}</span>
                  <span className={ac.tileLabel}>The field’s win rate</span>
                  <span className={ac.tileHint}>
                    {data.field.won} won of {data.field.priced} prices sent
                  </span>
                </div>
              </div>

              <h2 className={s.h2}>Jobs on your patch, by month</h2>
              <p className={s.sub}>
                Every job sent out in the counties you cover and within your radius, whether or
                not it reached you. Hover a month for the split.
              </p>
              <div className={s.chart}>
                <div className={s.plot}>
                  {[0.5, 1].map((f) => (
                    <div key={f} className={s.gridline} style={{ bottom: `${f * 100}%` }}>
                      <span className={s.gridlabel}>{Math.round(top * f)}</span>
                    </div>
                  ))}
                  {data.months.map((m, i) => (
                    <div
                      key={m.month}
                      className={s.col}
                      role="img"
                      aria-label={`${monthLong(m.month)}: ${m.jobs} ${m.jobs === 1 ? 'job' : 'jobs'}, ${m.invited} reached you`}
                    >
                      {(i === peakIdx || i === lastIdx) && m.jobs > 0 && (
                        <span className={s.barLabel} style={{ bottom: `${(m.jobs / top) * 100}%`, top: 'auto', transform: 'translateY(-4px)' }}>
                          {m.jobs}
                        </span>
                      )}
                      <span className={s.tip}>
                        {monthLong(m.month)}: {m.jobs} {m.jobs === 1 ? 'job' : 'jobs'}, {m.invited} reached you
                      </span>
                      <div
                        className={m.jobs > 0 ? s.bar : `${s.bar} ${s.barEmpty}`}
                        style={{ height: `${Math.max(1, (m.jobs / top) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className={s.months} aria-hidden="true">
                  {data.months.map((m) => (
                    <span key={m.month} className={s.month}>
                      <span className={s.monthFull}>{monthShort(m.month)}</span>
                      <span className={s.monthShort}>{monthShort(m.month)[0]}</span>
                    </span>
                  ))}
                </div>
                <p className={s.span}>
                  {monthLong(data.months[0]!.month)} to {monthLong(data.months[data.months.length - 1]!.month)}
                </p>
                <details className={s.tableToggle}>
                  <summary>Show as a table</summary>
                  <div className={s.tableWrap} style={{ marginTop: 10 }}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th className={s.num}>Jobs</th>
                          <th className={s.num}>Reached you</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.months.map((m) => (
                          <tr key={m.month}>
                            <td>{monthLong(m.month)}</td>
                            <td className={s.num}>{m.jobs}</td>
                            <td className={s.num}>{m.invited}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              <h2 className={s.h2}>What work goes for</h2>
              <p className={s.sub}>
                The prices contractors sent on those jobs, before our commission: the typical
                price is the middle one, to the nearest £10. A service shows it only once at
                least {data.min_others} other contractors have priced it.
              </p>
              {data.services.length === 0 ? (
                <p className={s.fine}>No jobs on your patch in the last twelve months yet.</p>
              ) : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th className={s.num}>Jobs</th>
                        <th className={s.num}>Prices sent</th>
                        <th className={s.num}>Typical price</th>
                        <th className={s.num}>Won</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.services.map((sv) => (
                        <tr key={sv.service}>
                          <td>{sv.service}</td>
                          <td className={s.num}>{sv.jobs}</td>
                          <td className={s.num}>
                            {sv.prices}
                            {sv.contractors > 0 && <span className={s.muted}> from {sv.contractors}</span>}
                          </td>
                          <td className={s.num}>
                            {sv.median != null ? formatGBP(sv.median) : <span className={s.muted}>too few prices</span>}
                          </td>
                          <td className={s.num}>{sv.won}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className={s.fine}>
                Total prices only: a per-acre rate isn’t a job price, so it isn’t counted. “Won”
                is jobs where the customer accepted a price from anyone. Your own three figures
                are the invitations sent to you in the period, and of those, what you priced and
                what you won. Figures refresh as you open the page.
              </p>
            </>
          )}

          <p className={s.back}>
            <Link href="/account">← Back to your dashboard</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
