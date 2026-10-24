import type { Metadata } from 'next';
import { gscQuery, isoDaysAgo, type GscRow } from '@/lib/gsc';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { countryNameFromAlpha3, countryNameFromCode } from '@/lib/countries';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { PROMPT_LABEL_PREFIX, PROMPT_SOURCE_SUFFIX } from '@/lib/abroadPrompt';
import styles from '@/app/(frontend)/admin/seo/seo.module.css';

export const metadata: Metadata = {
  title: 'Abroad · Admin',
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
  source_path: string | null;
  created_at: string;
};

type Waiting = { country_name: string; customers: number; contractors: number };

/**
 * Is anyone outside the UK trying to use this? Three sources side by side:
 * who asked to be told when we open where they are (expansion_interest, all
 * time), who actually arrived and what they did in the last 28 days
 * (page_events and job_parse_events by the country Vercel saw), and what
 * Google showed to whom (Search Console by country). The gate for phase 1 of
 * going worldwide is the first table, so this page does not sit behind the
 * Search Console guard the other /admin/seo pages use: a lapsed Google token
 * blanks that one section and nothing else.
 */
export default async function CountriesPage() {
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
  const [
    { data: waitingData, error: waitingErr },
    { data: countsData, error: countsErr },
    { data: interestData, error: interestErr },
  ] = await Promise.all([
    admin.rpc('admin_interest_counts'),
    admin.rpc('admin_country_counts', { p_days: RANGE_DAYS }),
    admin
      .from('expansion_interest')
      .select('id, side, country_name, place, details, email, ip_country, source_path, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const waiting = (waitingData ?? []) as Waiting[];
  const counts = (countsData ?? []) as CountryCounts[];
  const interest = (interestData ?? []) as Interest[];
  const dbErr = waitingErr ?? countsErr ?? interestErr;

  // The outside-the-UK prompt (components/abroad/AbroadPrompt): shown,
  // dismissed, and which sign-up link was taken, by country, last 28 days.
  // Paged past the row cap; it only ever shows abroad, so this stays small.
  const since = new Date(Date.now() - RANGE_DAYS * 86_400_000).toISOString();
  let promptRows: { label: string | null; country: string | null; session_key: string }[] = [];
  let promptErr: string | null = null;
  try {
    promptRows = await fetchAll((from, to) =>
      admin
        .from('page_events')
        .select('label, country, session_key')
        .like('label', `${PROMPT_LABEL_PREFIX}%`)
        .gte('created_at', since)
        .order('id', { ascending: true })
        .range(from, to),
    );
  } catch (err) {
    promptErr = err instanceof Error ? err.message : String(err);
  }
  type PromptStats = { shown: number; dismissed: number; customer: number; contractor: number };
  const emptyStats = (): PromptStats => ({ shown: 0, dismissed: 0, customer: 0, contractor: 0 });
  const promptByCountry = new Map<string, PromptStats>();
  const promptTotal = emptyStats();
  for (const r of promptRows) {
    const event = (r.label ?? '').slice(PROMPT_LABEL_PREFIX.length) as keyof PromptStats;
    if (!(event in promptTotal)) continue;
    const key = r.country ?? '??';
    const c = promptByCountry.get(key) ?? emptyStats();
    c[event] += 1;
    promptTotal[event] += 1;
    promptByCountry.set(key, c);
  }
  const promptCountries = [...promptByCountry.entries()].sort((a, b) => b[1].shown - a[1].shown);
  const viaPrompt = interest.filter((r) => (r.source_path ?? '').endsWith(PROMPT_SOURCE_SUFFIX)).length;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Abroad</h1>
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
        {dbErr && (
          <p className={styles.error}>
            {dbErr.message}. The migration adding expansion_interest may not be applied yet.
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
              {waiting.map((c) => (
                <tr key={c.country_name}>
                  <td>{c.country_name}</td>
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
          outside the British Isles, and is not counted again under rejected. Rows before the
          migration have no country and show as Unknown.
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
          <h2>
            The sign-up prompt <span className={styles.badge}>last {RANGE_DAYS} days</span>
          </h2>
        </div>
        <p className={styles.tableNote}>
          The “Outside the UK?” card shown on the content pages to visitors whose country is not
          GB: how often it appeared, how often it was closed, and which sign-up link was taken.
          Registrations via prompt are waiting-list rows that arrived from it.
        </p>
        {promptErr && <p className={styles.error}>{promptErr}</p>}
        <div className={styles.totals}>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Shown</div>
            <div className={styles.totalValue}>{fmtNumber(promptTotal.shown)}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Closed</div>
            <div className={styles.totalValue}>{fmtNumber(promptTotal.dismissed)}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Work done → sign up</div>
            <div className={styles.totalValue}>{fmtNumber(promptTotal.customer)}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Doing the work → sign up</div>
            <div className={styles.totalValue}>{fmtNumber(promptTotal.contractor)}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>Registered via prompt</div>
            <div className={styles.totalValue}>{fmtNumber(viaPrompt)}</div>
          </div>
        </div>
        {promptCountries.length === 0 ? (
          <p className={styles.muted}>Not shown to anyone yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th className={styles.num}>Shown</th>
                <th className={styles.num}>Closed</th>
                <th className={styles.num}>Work done</th>
                <th className={styles.num}>Doing the work</th>
              </tr>
            </thead>
            <tbody>
              {promptCountries.map(([code, c]) => (
                <tr key={code}>
                  <td>{code === '??' ? 'Unknown' : countryNameFromCode(code)}</td>
                  <td className={styles.num}>{fmtNumber(c.shown)}</td>
                  <td className={styles.num}>{fmtNumber(c.dismissed)}</td>
                  <td className={styles.num}>{fmtNumber(c.customer)}</td>
                  <td className={styles.num}>{fmtNumber(c.contractor)}</td>
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
