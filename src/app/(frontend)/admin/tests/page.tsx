import type { Metadata } from 'next';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { HOME_SPLIT_ENABLED } from '@/lib/homeSplit';
import s from '../admin.module.css';
import { AdminTable } from '../ui';
import { refreshAbTestsAction } from './actions';
import {
  bookingRatePValue,
  emptyArm,
  getHomeSplit,
  getMarkupTest,
  twoProportionPValue,
  type HomeArm,
  type MarkupArm,
} from './data';

export const metadata: Metadata = { title: 'A/B tests · Admin' };
export const dynamic = 'force-dynamic';

const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-GB'));
const gbp = (pence: number | null | undefined) => (pence == null ? '—' : formatGBP(pence));
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((100 * num) / den)}%` : '—');

export default async function AbTestsPage() {
  const [homeR, markupR] = await Promise.allSettled([getHomeSplit(), getMarkupTest()]);
  const failures = [homeR, markupR]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  const hs = homeR.status === 'fulfilled' ? homeR.value.data : null;
  const mt = markupR.status === 'fulfilled' ? markupR.value.data : null;
  // The oldest reading on the page is the one worth stating.
  const ats = [homeR, markupR].flatMap((r) => (r.status === 'fulfilled' ? [r.value.at] : [])).sort();
  const asOf = ats.length
    ? new Date(ats[0]).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div>
      <h1 className={s.h1}>A/B tests</h1>
      <form action={refreshAbTestsAction}>
        <p className={s.sub}>
          {asOf ? `Figures as of ${asOf}, kept for an hour. ` : ''}
          <button
            type="submit"
            style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Refresh now
          </button>
        </p>
      </form>
      {failures.map((f) => (
        <div key={f} className={s.empty}>Could not load a test: {f}.</div>
      ))}

      {/* ── Home hero split test ─────────────────────────────────────── */}
      {hs && (() => {
        const arms = (['a', 'b'] as const).map((k) => hs.arms[k]);
        const [a, b] = arms;
        // Read on the outcome that matters, a job sent; fall back to quotes
        // started while sends are too few to say anything.
        const read = (x: HomeArm, ad: boolean) => (ad ? [x.ad_sent, x.ad_visits] : [x.sent, x.visits]);
        const pv = a && b && a.visits >= 100 && b.visits >= 100
          ? twoProportionPValue(read(a, false)[0], read(a, false)[1], read(b, false)[0], read(b, false)[1])
          : null;
        const row = (label: string, f: (x: HomeArm) => React.ReactNode) => (
          <tr key={label}>
            <td>{label}</td>
            {arms.map((x, i) => <td key={i}>{x ? f(x) : '—'}</td>)}
          </tr>
        );
        const of = (num: number, den: number) => `${n(num)} (${pct(num, den)})`;
        return (
          <>
            <div className={s.sectionLabel}>
              Home page split test, phones{HOME_SPLIT_ENABLED ? '' : ' (stopped)'} · last {hs.days} days
              {hs.since ? ` · since ${new Date(hs.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            <p className={s.sub}>
              A is the hero as it was. B puts the quote form under a smaller headline, with the intro and promises
              below it. Same header, photo and yellow banner. A visit is one browser tab; desktop and the app are not
              in the test.
              {pv != null
                ? ` On jobs sent, the chance the arms are really the same is ${pv < 0.001 ? 'under 0.1%' : `${Math.round(pv * 100)}%`}${pv < 0.05 ? ', a difference you can act on' : ', not enough to call yet'}.`
                : ' A reading on jobs sent needs 100 visits in each arm.'}
              {!hs.arms.a && !hs.arms.b && ' No visits recorded in the test yet.'}
            </p>
            <AdminTable head={['', 'A: as it was', 'B: form first']}>
              {row('Phone visits', (x) => n(x.visits))}
              {row('Saw the quote form', (x) => of(x.saw_form, x.visits))}
              {row('Started a quote', (x) => of(x.started, x.visits))}
              {row('Sent a job', (x) => of(x.sent, x.visits))}
              {row('Median scroll depth', (x) => (x.median_depth == null ? '—' : `${Math.round(x.median_depth)}%`))}
              {row('From ads: visits', (x) => n(x.ad_visits))}
              {row('From ads: saw the form', (x) => of(x.ad_saw_form, x.ad_visits))}
              {row('From ads: started a quote', (x) => of(x.ad_started, x.ad_visits))}
              {row('From ads: sent a job', (x) => of(x.ad_sent, x.ad_visits))}
            </AdminTable>
          </>
        );
      })()}


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
              Commission split test{mt.enabled ? '' : ' (paused)'}
              {mt.since ? ` · since ${new Date(mt.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            <p className={s.sub}>
              Each job is put in an arm when its first price is published, and every price on it carries that rate.
              Extra work and repeats inherit the parent job&rsquo;s arm. Jobs priced before the test stay at 10% and are not counted.
              {pv != null
                ? ` On booking rate, the chance the arms are really the same is ${pv < 0.001 ? 'under 0.1%' : `${Math.round(pv * 100)}%`}${pv < 0.05 ? ', a difference you can act on' : ', not enough to call yet'}.`
                : ' A reading on booking rate needs at least five priced jobs in each arm.'}
              {Object.keys(mt.passes_30d ?? {}).length > 0 && (
                <>
                  {' '}Prices passed on in 30 days, all jobs:{' '}
                  {Object.entries(mt.passes_30d)
                    .sort((x, y) => y[1] - x[1])
                    .map(([r, c]) => `${c} ${r.replace(/_/g, ' ')}`)
                    .join(', ')}
                  .
                </>
              )}
            </p>
            <AdminTable head={['', ...arms.map((x) => `${Math.round(x.rate * 100)}% commission`)]}>
              {row('Jobs in the arm', (x) => n(x.jobs))}
              {row('Priced', (x) => `${n(x.priced)} (${n(x.prices)} prices)`)}
              {row('Passed on', (x) => (x.prices ? `${n(x.passes)} of ${n(x.prices)} prices (${n(x.passes_price)} as too expensive)` : '0'))}
              {row('Booked', (x) => (x.priced ? `${n(x.booked)} (${rate(x)} of priced)` : '0'))}
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
    </div>
  );
}
