import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { countryNameFromAlpha3, countryNameFromCode } from '@/lib/countries';
import { seoGuard } from '../guard';
import styles from '../seo.module.css';

export const metadata: Metadata = {
  title: 'Countries · Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RANGE_DAYS = 28;
const GSC_LAG_DAYS = 3;

function fmtNumber(n: number) {
  return n.toLocaleString('en-GB');
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

type Row = GscRow & { keys?: string[] };
type CountryCounts = {
  country: string;
  visits: number;
  parses_ok: number;
  parses_rejected: number;
  outside_uk: number;
  interest: number;
};
type Interest = {
  id: number;
  side: string;
  country_name: string;
  place: string | null;
  details: string | null;
  email: string;
  ip_country: string | null;
  created_at: string;
};

/**
 * Is anyone outside the UK trying to use this? Three sources side by side,
 * all for the last 28 days: what Google showed to whom (Search Console by
 * country), who actually arrived and what they did (page_events and
 * job_parse_events by the country Vercel saw), and who asked to be told when
 * we open where they are (expansion_interest). The gate for phase 1 of going
 * worldwide is the last table.
 */
export default async function CountriesPage() {
  const { block } = await seoGuard();
  if (block) return block;

  const endDate = isoDaysAgo(GSC_LAG_DAYS);
  const startDate = isoDaysAgo(GSC_LAG_DAYS + RANGE_DAYS);

  let gsc: Row[] = [];
  let gscErr: string | null = null;
  try {
    gsc = await gscQuery({ startDate, endDate, dimensions: ['country'], rowLimit: 50 });
  } catch (err) {
    gscErr = err instanceof Error ? err.message : String(err);
  }

  const admin = createServiceRoleClient();
  const [{ data: countsData, error: countsErr }, { data: interestData, error: interestErr }] = await Promise.all([
    admin.rpc('admin_country_counts', { p_days: RANGE_DAYS }),
    admin
      .from('expansion_interest')
      .select('id, side, country_name, place, details, email, ip_country, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const counts = (countsData ?? []) as CountryCounts[];
  const interest = (interestData ?? []) as Interest[];

  // The waiting list by country, for the gate: how many on each side.
  const byCountry = new Map<string, { customers: number; contractors: number }>();
  for (const r of interest) {
    const c = byCountry.get(r.country_name) ?? { customers: 0, contractors: 0 };
    if (r.side === 'contractor') c.contractors += 1;
    else c.customers += 1;
    byCountry.set(r.country_name, c);
  }
  const waiting = [...byCountry.entries()].sort(
    (a, b) => b[1].customers + b[1].contractors - (a[1].customers + a[1].contractors),
  );

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Countries</h1>
          <p className={styles.range}>
            Last {RANGE_DAYS} days &middot; {startDate} → {endDate}
          </p>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>Waiting list</h2>
        </div>
        <p className={styles.tableNote}>
          People outside the UK who asked, on /outside-the-uk, to be told when we open where they
          are. The gate for building a country is here: enough of both sides, in one place.
        </p>
        {(interestErr || countsErr) && (
          <p className={styles.error}>
            {interestErr?.message ?? countsErr?.message}. The migration adding expansion_interest may
            not be applied yet.
          </p>
        )}
        {waiting.length === 0 ? (
          <p className={styles.muted}>Nobody yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th className={styles.num}>Customers</th>
                <th className={styles.num}>Contractors</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map(([name, c]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className={styles.num}>{fmtNumber(c.customers)}</td>
                  <td className={styles.num}>{fmtNumber(c.contractors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>Visitors and attempts by country</h2>
        </div>
        <p className={styles.tableNote}>
          The country Vercel saw on the request. Visits are distinct landing-page sessions; parses
          are /start submissions; outside UK is a /start attempt refused because the location was
          outside the British Isles. Rows before the migration have no country and show as ??.
        </p>
        {counts.length === 0 ? (
          <p className={styles.muted}>Nothing recorded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th className={styles.num}>Visits</th>
                <th className={styles.num}>Parses ok</th>
                <th className={styles.num}>Rejected</th>
                <th className={styles.num}>Outside UK</th>
                <th className={styles.num}>Registered</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((r) => (
                <tr key={r.country}>
                  <td>{r.country === '??' ? 'Unknown' : countryNameFromCode(r.country)}</td>
                  <td className={styles.num}>{fmtNumber(r.visits)}</td>
                  <td className={styles.num}>{fmtNumber(r.parses_ok)}</td>
                  <td className={styles.num}>{fmtNumber(r.parses_rejected)}</td>
                  <td className={styles.num}>{fmtNumber(r.outside_uk)}</td>
                  <td className={styles.num}>{fmtNumber(r.interest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>Search Console by country</h2>
        </div>
        <p className={styles.tableNote}>
          Where Google showed us, and who clicked. Overseas impressions so far have been the notes
          (harrowing, subsoiling, topping), not job searches: read the queries page filtered by
          country before taking a number here as demand.
        </p>
        {gscErr && (
          <section className={styles.error}>
            <h2>Couldn&apos;t load Search Console</h2>
            <pre>{gscErr}</pre>
          </section>
        )}
        {gsc.length === 0 ? (
          <p className={styles.muted}>Nothing in this range yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th className={styles.num}>Clicks</th>
                <th className={styles.num}>Impr.</th>
                <th className={styles.num}>Position</th>
              </tr>
            </thead>
            <tbody>
              {gsc.map((r) => (
                <tr key={r.keys?.[0] ?? '—'}>
                  <td>{countryNameFromAlpha3(r.keys?.[0] ?? '—')}</td>
                  <td className={styles.num}>{fmtNumber(r.clicks)}</td>
                  <td className={styles.num}>{fmtNumber(r.impressions)}</td>
                  <td className={styles.num}>{r.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>Latest registrations</h2>
        </div>
        {interest.length === 0 ? (
          <p className={styles.muted}>Nobody yet.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Side</th>
                  <th>Country</th>
                  <th>Where</th>
                  <th>Says</th>
                  <th>Email</th>
                  <th>Seen from</th>
                </tr>
              </thead>
              <tbody>
                {interest.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>{r.side}</td>
                    <td>{r.country_name}</td>
                    <td>{r.place ?? '—'}</td>
                    <td>{r.details ?? '—'}</td>
                    <td>{r.email}</td>
                    <td>{countryNameFromCode(r.ip_country)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
