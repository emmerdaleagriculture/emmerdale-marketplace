import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { faqSchema, type Faq } from '@/components/paddock/PaddockSections';
import { getCostSnapshot } from '@/lib/costPerAcre/load';
import {
  type Rate,
  NO_DATA_FILL,
  countyVar,
  dayLabel,
  monthLabel,
  pounds,
  range,
  regionRates,
  regionsWithData,
  servicesByJobs,
  totals,
} from '@/lib/costPerAcre/model';
import { UK_COUNTY_NAMES } from '@/lib/coverage';
import { UK_COUNTY_PATHS, UK_MAP_VIEWBOX } from '@/lib/ukCountyPaths';
import { SERVICE_PAGES } from '@/lib/services';
import { jsonLd } from '@/lib/jsonld';
import { COMPANY_LEGAL_NAME, ORG_ID, siteUrl } from '@/lib/site';
import { CostExplorer } from './CostExplorer';
import a from '../auth.module.css';
import s from '../landing.module.css';
import css from './costPerAcre.module.css';

// Daily: the snapshot changes on the first of the month, and a day's lag on
// the "updated" line is nothing against a month between figures.
export const revalidate = 86400;

const SITE = siteUrl();
const TITLE = 'Cost Per Acre by County: Contractor Prices Across the UK';
const DESCRIPTION =
  'Average cost per acre for paddock topping, harrowing, weed control and more, county by county. Real prices customers were quoted by contractors, updated monthly.';

export async function generateMetadata(): Promise<Metadata> {
  const snapshot = await getCostSnapshot();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/cost-per-acre' },
    // Nothing to index until the first snapshot has figures in it.
    robots: { index: snapshot.uk.length > 0, follow: true },
  };
}

/** Service name to its /services page, for the links in every table. */
function servicePaths(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of SERVICE_PAGES) for (const name of p.canonical) out[name] = `/services/${p.path}`;
  return out;
}

/**
 * The UK outlines, server-rendered once. Each county paints with a CSS
 * variable the explorer sets, and falls back to neutral: a county with no
 * figure for the chosen job stays grey without anyone touching the DOM.
 */
function CountyMap() {
  return (
    <svg viewBox={UK_MAP_VIEWBOX} className={css.map} role="img" aria-label="Map of UK counties, shaded by average cost per acre for the chosen job">
      {UK_COUNTY_NAMES.map((name) => {
        const v = countyVar(name);
        return (
          <path
            key={name}
            d={UK_COUNTY_PATHS[name]}
            data-county={name}
            className={css.county}
            style={{
              fill: `var(${v}, ${NO_DATA_FILL})`,
              stroke: `var(${v}-s, #fff)`,
              strokeWidth: `var(${v}-w, 1)`,
            }}
          >
            <title>{name}</title>
          </path>
        );
      })}
    </svg>
  );
}

function methodFaqs(since: string | null): Faq[] {
  return [
    {
      q: 'Where do these prices come from?',
      a: `Every figure is built from prices that contractors in our network sent to customers for real jobs${since ? ` since ${dayLabel(since)}` : ''}. When a job received several prices we take their average, then divide by the acres the job covered. The county, region and UK figures are the averages of those per-job figures. Whether the customer went ahead makes no difference: a price is a price.`,
    },
    {
      q: 'Why is a small paddock so expensive per acre?',
      a: 'Most contractors have a minimum charge, because getting a tractor to you costs the same whether you have half an acre or ten. A £200 minimum on a quarter-acre plot is £800 an acre. That is why the range beside each average is wide, and why a county with one job in it should be read as one job, not a going rate.',
    },
    {
      q: 'Do the prices include VAT?',
      a: 'Some do and some do not. Many of the contractors in the network are below the VAT threshold and quote without it; the larger firms quote inclusive. The figures mix both, as the prices customers actually received do.',
    },
    {
      q: 'Which jobs are included?',
      a: 'Jobs priced by the acre: topping, flailing, harrowing, rolling, spraying, overseeding, muck spreading and the like. Hedge cutting, fencing, hay and tractor hire are priced by the metre, the bale or the hour, so they are left out rather than forced into a per-acre figure that would mean nothing.',
    },
    {
      q: 'How often is this page updated?',
      a: 'On the first of every month. The figures are a snapshot, so a county’s average will not move under you mid-month; the date at the top says which snapshot you are reading.',
    },
  ];
}

export default async function CostPerAcrePage() {
  const snapshot = await getCostSnapshot();
  const paths = servicePaths();
  const services = servicesByJobs(snapshot);
  const regions = regionsWithData(snapshot);
  const t = totals(snapshot);
  const faqs = methodFaqs(snapshot.since);
  const hasData = snapshot.uk.length > 0;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb tone="light" items={[{ label: 'Cost per acre' }]} />
          <div className={a.eyebrow}>Real prices, updated monthly</div>
          <h1 className={a.title}>
            What agricultural work costs <em>per acre, county by county.</em>
          </h1>
          <p className={a.sub}>
            Every figure on this page is a price a customer was actually quoted by a contractor in our
            network, divided by the acres the job covered. Not a guide, not an estimate: what people
            were asked to pay.
          </p>
          {hasData ? (
            <>
              <ul className={css.stats} aria-label="What the figures rest on">
                <li className={css.stat}>
                  <span className={css.statN}>{t.quotes.toLocaleString('en-GB')}</span>
                  <span className={css.statL}>prices from contractors</span>
                </li>
                <li className={css.stat}>
                  <span className={css.statN}>{t.jobs.toLocaleString('en-GB')}</span>
                  <span className={css.statL}>jobs priced</span>
                </li>
                <li className={css.stat}>
                  <span className={css.statN}>{t.counties}</span>
                  <span className={css.statL}>counties with a figure</span>
                </li>
              </ul>
              <p className={css.updated}>
                {snapshot.computedAt && <>Updated {monthLabel(snapshot.computedAt)}. </>}
                {snapshot.since && <>Jobs since {dayLabel(snapshot.since)}. </>}
                Next refresh on the first of the month.
              </p>
            </>
          ) : (
            <p className={css.updated}>
              The first month&rsquo;s prices are still coming in. Figures appear here on the first of the
              month.
            </p>
          )}
        </div>
      </main>

      {hasData && (
        <>
          <section className={`${s.section} ${s.sectionAlt}`}>
            <div className={s.sectionInner}>
              <div className={s.kicker}>Across the UK</div>
              <h2 className={s.sectionTitle}>
                Average cost per acre, <em>by job.</em>
              </h2>
              <p className={s.sectionLede}>
                The average is what you would expect to be quoted; the typical figure is the middle job,
                less swayed by a tiny paddock on a minimum charge. The range is the cheapest and dearest
                job we have seen.
              </p>
              <UkTable rates={services} paths={paths} />
              <p className={css.fine}>
                Per-acre figures are the average price for the job divided by its acreage. Where several
                contractors priced one job, their prices are averaged first. Small plots carry minimum
                charges, which is what stretches the ranges.
              </p>
            </div>
          </section>

          <section className={s.section}>
            <div className={s.sectionInner}>
              <div className={s.kicker}>By county</div>
              <h2 className={s.sectionTitle}>
                Pick a job, <em>then a county.</em>
              </h2>
              <p className={s.sectionLede}>
                Shaded counties have at least one priced job for the chosen work. Tap one to see every job
                priced there, beside the figures for its region.
              </p>
              <CostExplorer snapshot={snapshot} map={<CountyMap />} servicePaths={paths} />
            </div>
          </section>

          <section className={`${s.section} ${s.sectionAlt}`}>
            <div className={s.sectionInner}>
              <div className={s.kicker}>Every figure we have</div>
              <h2 className={s.sectionTitle}>
                Cost per acre <em>in every county with a priced job.</em>
              </h2>
              <p className={s.sectionLede}>
                Region by region, every county and every job with at least one price. One job is one
                job: read the count before the figure.
              </p>
              {regions.map((region) => (
                <RegionBlock key={region} region={region} snapshot={snapshot} paths={paths} />
              ))}
            </div>
          </section>
        </>
      )}

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it is worked out</div>
          <h2 className={s.sectionTitle}>
            The method, <em>in plain terms.</em>
          </h2>
          <div className={css.prose}>
            {faqs.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
            <h3>Want a price for your own land?</h3>
            <p>
              <Link href="/start">Describe the job</Link> and the vetted contractors covering your county
              send their prices. No obligation, and you will see where your quotes sit against the
              figures here.
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />
      {hasData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              '@context': 'https://schema.org',
              '@type': 'Dataset',
              name: 'Agricultural contractor cost per acre by UK county',
              description: DESCRIPTION,
              url: `${SITE}/cost-per-acre`,
              license: `${SITE}/customer-terms`,
              creator: { '@type': 'Organization', '@id': ORG_ID, name: COMPANY_LEGAL_NAME },
              ...(snapshot.computedAt ? { dateModified: snapshot.computedAt.slice(0, 10) } : {}),
              ...(snapshot.since && snapshot.computedAt
                ? { temporalCoverage: `${snapshot.since.slice(0, 10)}/${snapshot.computedAt.slice(0, 10)}` }
                : {}),
              spatialCoverage: { '@type': 'Place', name: 'United Kingdom' },
              variableMeasured: 'Average price per acre quoted to customers, GBP',
              isAccessibleForFree: true,
            }),
          }}
        />
      )}
    </div>
  );
}

function UkTable({ rates, paths }: { rates: Rate[]; paths: Record<string, string> }) {
  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col" className={css.num}>
              Average per acre
            </th>
            <th scope="col" className={css.num}>
              Typical
            </th>
            <th scope="col" className={css.num}>
              Range
            </th>
            <th scope="col" className={css.num}>
              Jobs
            </th>
            <th scope="col" className={css.num}>
              Acres
            </th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.serviceId}>
              <th scope="row" className={css.rowHead}>
                {paths[r.service] ? <Link href={paths[r.service]}>{r.service}</Link> : r.service}
              </th>
              <td className={`${css.num} ${css.avg}`}>{pounds(r.avg)}</td>
              <td className={css.num}>{pounds(r.median)}</td>
              <td className={`${css.num} ${css.muted}`}>{range(r)}</td>
              <td className={css.num}>{r.jobs}</td>
              <td className={`${css.num} ${css.muted}`}>{r.acres.toLocaleString('en-GB', { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegionBlock({
  region,
  snapshot,
  paths,
}: {
  region: string;
  snapshot: Awaited<ReturnType<typeof getCostSnapshot>>;
  paths: Record<string, string>;
}) {
  const rows = snapshot.counties
    .filter((r) => r.region === region)
    .sort((x, y) => (x.county ?? '').localeCompare(y.county ?? '') || y.jobs - x.jobs);
  const regional = regionRates(snapshot, region);
  return (
    <div className={css.region}>
      <h3 className={css.regionTitle} id={`region-${countyVar(region).slice(4)}`}>
        {region}
      </h3>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th scope="col">County</th>
              <th scope="col">Job</th>
              <th scope="col" className={css.num}>
                Average per acre
              </th>
              <th scope="col" className={css.num}>
                Range
              </th>
              <th scope="col" className={css.num}>
                Jobs
              </th>
              <th scope="col" className={css.num}>
                Acres
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.county}-${r.serviceId}`}>
                <td>{r.county}</td>
                <td>{paths[r.service] ? <Link href={paths[r.service]}>{r.service}</Link> : r.service}</td>
                <td className={`${css.num} ${css.avg}`}>{pounds(r.avg)}</td>
                <td className={`${css.num} ${css.muted}`}>{range(r)}</td>
                <td className={css.num}>{r.jobs}</td>
                <td className={`${css.num} ${css.muted}`}>{r.acres.toLocaleString('en-GB', { maximumFractionDigits: 1 })}</td>
              </tr>
            ))}
            {regional.map((r) => (
              <tr key={`region-${r.serviceId}`}>
                <td className={css.muted}>All of {region}</td>
                <td className={css.muted}>{r.service}</td>
                <td className={`${css.num} ${css.avg}`}>{pounds(r.avg)}</td>
                <td className={`${css.num} ${css.muted}`}>{range(r)}</td>
                <td className={css.num}>{r.jobs}</td>
                <td className={`${css.num} ${css.muted}`}>{r.acres.toLocaleString('en-GB', { maximumFractionDigits: 1 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
