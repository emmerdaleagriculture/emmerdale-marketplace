import { jsonLd } from '@/lib/jsonld';
import type { Metadata } from 'next';
import Image from 'next/image';
import { PageTracker } from '@/components/PageTracker';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import { StickyBar } from '@/components/home/StickyBar';
import { DeferredImage } from '@/components/home/DeferredImage';
import { ServiceCard } from '@/components/home/ServiceCard';
import { TrackedLink } from '@/components/home/Track';
import { CoverageSection } from '@/components/home/CoverageSection';
import { JobsInProgress } from '@/components/home/JobsInProgress';
import { RecentWork } from '@/components/home/RecentWork';
import { QuoteWidget } from '@/components/home/QuoteWidget';
import { Comparison } from '@/components/home/Comparison';
import { UK_COUNTY_NAMES } from '@/lib/coverage';
import { HOME_SERVICES } from '@/lib/home/services';
import { getCountyCoverage } from '@/lib/reference';
import { allCountyRefs } from '@/lib/verticals';
import {
  COMPANY_LEGAL_NAME,
  COMPANY_NUMBER,
  HPM_URL,
  PHONE_TEL,
  SERVICE_AREA,
  siteUrl,
} from '@/lib/site';
import s from '@/components/home/home.module.css';

// Canonical origin for structured data — www in production.
const SITE = siteUrl();

/** Tom's other company — named on the founder card, for credibility. */
const LUMENIRA_URL = 'https://www.lumenira.com';

/** Tom's public profile — the founder card links his name to it. */
const LINKEDIN_URL = 'https://www.linkedin.com/in/tom-oswald-a7233619/';

/**
 * Every customer CTA lands here. Cards carry their service in the query so the
 * form knows what was clicked — /start reads it client-side, in LandingFlow,
 * because the page itself reads no searchParams and must stay static.
 */
const START_HREF = '/start';

// ISR: statically cached at the CDN, re-rendered at most hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Get prices from approved operators near you',
  description:
    'A managed marketplace for rural land. Tell us what needs doing and approved operators near you come back with prices you can compare side by side — with every job covered by our own insurance.',
  alternates: { canonical: '/' },
};

// Organization schema — credibility signals (company number, HPM relationship).
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Emmerdale Agriculture',
  legalName: COMPANY_LEGAL_NAME,
  url: SITE,
  // Raster logo (PNG) — Google's logo guidelines don't reliably pick up SVG.
  logo: `${SITE}/apple-icon.png`,
  ...(COMPANY_NUMBER
    ? {
        identifier: {
          '@type': 'PropertyValue',
          propertyID: 'Company Number',
          value: COMPANY_NUMBER,
        },
      }
    : {}),
  telephone: PHONE_TEL,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'The Old Poultry Shed, Upper Slackstead Farm, Farley Lane',
    addressLocality: 'Braishfield',
    addressRegion: 'Hampshire',
    postalCode: 'SO51 0QL',
    addressCountry: 'GB',
  },
  founder: {
    '@type': 'Person',
    name: 'Tom Oswald',
    jobTitle: 'Managing Director',
    sameAs: [LINKEDIN_URL],
    // The other company he founded — the same credibility the card claims.
    affiliation: { '@type': 'Organization', name: 'Lumenira', url: LUMENIRA_URL },
  },
  areaServed: { '@type': 'AdministrativeArea', name: SERVICE_AREA },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    telephone: PHONE_TEL,
    areaServed: 'GB',
    availableLanguage: 'English',
  },
  sameAs: [HPM_URL],
  description:
    `A managed marketplace for rural land, run by ${COMPANY_LEGAL_NAME}, the company behind Hampshire Paddock Management. Paddock, land and equestrian jobs completed by approved operators across ${SERVICE_AREA}, with several prices to compare.`,
};

// Photo strip. The design stubs its imagery as "(existing photo)" placeholders,
// so the real assets slot into those positions rather than being dropped.
type GalleryPhoto = { src: string; alt: string; pos: string };

const GALLERY: GalleryPhoto[] = [
  {
    src: '/harvest-work.jpg',
    alt: 'A John Deere tractor and trailer running alongside a combine at harvest',
    pos: '50% 50%',
  },
  {
    src: '/john-deere-6130r.jpg',
    alt: 'A John Deere 6130R with a spreader in a freshly mown field under a stormy sky',
    pos: '50% 68%',
  },
  {
    src: '/john-deere-6130r-kuhn.jpg',
    alt: 'A John Deere 6130R with a Kuhn flail mower beside a hedge',
    pos: '50% 50%',
  },
  {
    src: '/honda-trx520.jpg',
    alt: 'A Honda TRX520 quad towing a paddock sweeper under a stormy sky',
    pos: '50% 62%',
  },
];

function PhotoStrip({ photos, label }: { photos: GalleryPhoto[]; label: string }) {
  return (
    <section className={s.gallery} aria-label={label}>
      <div className={s.container}>
        <ul className={s.galleryGrid}>
          {photos.map((g) => (
            <li key={g.src} className={s.galleryItem}>
              <DeferredImage
                src={g.src}
                alt={g.alt}
                fill
                quality={70}
                sizes="(min-width: 1024px) 300px, 50vw"
                rootMargin="400px"
                className={s.galleryImg}
                style={{ objectPosition: g.pos }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The trust ticker. "Prices upfront" came off: there is no price on the site
 * and the variance in this trade is too wide for an honest one, so the claim
 * was never quite true. "We hold your money until you're happy" came off next
 * — under the deposit model we hold 15%, not the money, and the balance is
 * charged after sign-off. The claim outgrew the mechanism.
 */
const TICKER = ['Several prices to choose from', 'Vetted & insured operators'];

/** The hero's three promises, each the answer to a real hesitation. */
const PROMISES: [string, string][] = [
  ['Several prices, not one.', 'Approved operators near you price your job, usually inside 24 hours.'],
  ['Vetted operators, and every job insured.', 'Our own £5m policy covers the work, whoever does it.'],
  ['We hold your deposit until you’re happy.', 'The contractor gets paid when you say the job’s right.'],
];

const STEPS: [string, string][] = [
  ['You tell us the job', 'Pick a service and give us a postcode. About a minute.'],
  ['We ask operators near you', 'Vetted, and the work insured by us. They price your job directly.'],
  ['You compare prices', 'Side by side, with distance. Sort by price.'],
  ['You book and pay online', 'A 15% deposit to book, and the rest once the work is done.'],
  ['The work gets done', 'Before and after photos land on your job page.'],
];

const Tick = () => (
  <svg
    className={s.promiseTick}
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export default async function LandingPage() {
  const [coverage, counties] = await Promise.all([getCountyCoverage(), allCountyRefs()]);
  const coveredCounties = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0);

  // Service schema — what can be booked, where, and the route to a price.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Paddock maintenance & land services',
    serviceType: HOME_SERVICES.map((svc) => svc.name),
    description:
      `Paddock maintenance and agricultural contracting, including topping, harrowing, rolling, overseeding, hedge cutting, fencing and land clearance, for paddock owners, equestrian yards, farms and estates across ${SERVICE_AREA}. Completed by approved operators, with several prices to compare.`,
    url: `${SITE}${START_HREF}`,
    provider: {
      '@type': 'Organization',
      name: COMPANY_LEGAL_NAME,
      url: SITE,
      brand: { '@type': 'Brand', name: 'Hampshire Paddock Management' },
    },
    areaServed: coveredCounties.map((name) => ({ '@type': 'AdministrativeArea', name })),
  };

  return (
    <div className={s.page}>
      <PageTracker path="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(orgJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }} />

      <a className={s.skip} href="#main">
        Skip to main content
      </a>

      <HomeHeader />

      <div className={s.ticker} role="region" aria-label="What you get">
        <div className={s.container}>
          <ul className={s.tickerList}>
            {TICKER.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>

      <main id="main">
        {/* The hero leads with the proposition, not with Tom. Someone arriving
            from "paddock topping cost" had to read 364 words before anything
            invited them to act; the widget puts the ask on screen beside the
            promise. Tom moves down the page, where his story does its real
            work as reassurance rather than as an obstacle. */}
        <section className={s.hero} id="quote">
          <div className={`${s.container} ${s.heroGrid}`}>
            <div>
              <p className={s.kicker}>A managed marketplace for rural land</p>
              <h1 className={s.heroH1}>Get prices from approved operators near you.</h1>
              <p className={s.heroSub}>
                Tell us what needs doing. Vetted operators covering your patch
                price the job, <strong>you see them side by side</strong>, and
                you book the one you want — with the work insured by us. No
                phone calls out of the blue.
              </p>
              <ul className={s.promises}>
                {PROMISES.map(([title, body]) => (
                  <li key={title}>
                    <Tick />
                    <span>
                      <strong>{title}</strong> {body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <QuoteWidget />
          </div>
        </section>

        {/* What is happening right now, then what past work cost. Live work
            first: it answers "is this thing running?" before the completed
            board answers "what will it cost?". Both hide themselves rather
            than render thin. */}
        <JobsInProgress />

        {/* What past work cost — the persuasion engine, straight after the
            hero. Hides itself until there are enough real completed jobs. */}
        <RecentWork />

        {/* Full service board. Every card carries its service into the form, so
            the customer never describes twice what they already chose. */}
        <section id="services" className={s.services}>
          <div className={s.container}>
            <p className={s.eyebrow}>Everything we do</p>
            <h2 className={s.sectionH}>Pick the job. Operators near you come back with prices.</h2>
            <p className={s.lede}>
              If you own a paddock or a bit of land, finding someone reliable
              usually means trawling Facebook groups and hoping for the best. We
              do that part for you.
            </p>
            <div className={s.servicesGrid}>
              {HOME_SERVICES.map((svc) => (
                <ServiceCard
                  key={svc.slug}
                  svc={svc}
                  // `job` and `src` are LandingFlow's existing prefill params:
                  // the card's service arrives already typed into the
                  // description, and the hand-off is attributed to the home
                  // page rather than showing up as "(direct)". `service` is
                  // the pick itself, which opens a service's own questions.
                  href={`${START_HREF}?job=${encodeURIComponent(svc.name)}&service=${svc.slug}&src=home`}
                />
              ))}
            </div>
          </div>
        </section>

        <Comparison />

        <section id="how" className={s.how}>
          <div className={s.container}>
            <p className={s.eyebrow}>How it works</p>
            <h2 className={s.sectionH}>
              No phone calls out of the blue, and nothing to pay to find out the price.
            </h2>
            <ol className={s.steps}>
              {STEPS.map(([title, body], i) => (
                <li key={title} className={s.step}>
                  <span className={s.stepNum}>{i + 1}</span>
                  <h3 className={s.stepH}>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <PhotoStrip photos={GALLERY} label="Our work" />

        {/* Where we work — live coverage choropleth. Its copy is computed from
            the database rather than hardcoded, which is why it still says
            England, Wales and Scotland where the design says England only.
            That contradiction is Tom's to settle; a true claim is not narrowed
            to a false one here. */}
        <CoverageSection coverage={coverage} counties={counties} />

        {/* Tom, as reassurance rather than as the headline. */}
        <section className={s.tom} id="about">
          <div className={`${s.container} ${s.tomGrid}`}>
            <figure className={s.tomPhoto}>
              <Image
                src="/tom-oswald.jpg"
                alt="Tom Oswald standing in front of a John Deere 9RX 830 tractor"
                fill
                quality={65}
                sizes="(min-width: 860px) 420px, 100vw"
                className={s.tomImg}
              />
            </figure>
            <div>
              <p className={s.eyebrow}>Who&rsquo;s behind it</p>
              <blockquote className={s.tomQuote}>
                <p>
                  I started{' '}
                  <a href={HPM_URL} className={s.tomLink} target="_blank" rel="noopener noreferrer">
                    Hampshire Paddock Management
                  </a>{' '}
                  looking after paddocks, smallholdings and grassland across the
                  South of England — topping, harrowing, rolling, hedges, the
                  everyday work that keeps land in good order. I&rsquo;m also the
                  founder of{' '}
                  {/* A followed link on purpose (Tom, 2026-09-24): no nofollow,
                      sponsored or ugc, and no noreferrer either, so the visit
                      shows up as coming from here. noopener only guards the
                      new tab and has no bearing on how search engines treat it. */}
                  <a href={LUMENIRA_URL} className={s.tomLink} target="_blank" rel="noopener">
                    Lumenira
                  </a>
                  , a world-leading photo sharing site with thousands of users.
                </p>
                <p>
                  <strong>
                    The enquiries never stopped coming, and one firm can only be
                    in so many fields at once.
                  </strong>{' '}
                  So we grew into Emmerdale Agriculture: the same standard of
                  work, delivered across the UK by approved operators we know
                  and trust.
                </p>
              </blockquote>
              <div className={s.byline}>
                <span className={s.bylineAvatar} aria-hidden="true">
                  TO
                </span>
                <span>
                  <a
                    href={LINKEDIN_URL}
                    className={s.bylineName}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Tom Oswald
                  </a>
                  <span className={s.bylineRole}>Managing Director</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Operators band. */}
        <section id="operators" className={s.operators}>
          <div className={`${s.container} ${s.operatorsGrid}`}>
            <div>
              <p className={`${s.eyebrow} ${s.eyebrowLight}`}>For operators</p>
              <h2 className={`${s.sectionH} ${s.operatorsH}`}>
                Run an agricultural contracting business?
              </h2>
              <p className={s.operatorsCopy}>
                We bring you the customer and handle the payment. You set your
                own price and do the work you&rsquo;re good at.
              </p>
            </div>
            <div className={s.operatorsCta}>
              {/* The supply side is currently invisible in the numbers — this
                  is the only signal that anyone is trying to join. */}
              <TrackedLink
                href="/signup"
                event="operator_apply"
                className={`${s.btn} ${s.btnLg} ${s.btnOutlineLight}`}
              >
                Apply to join
              </TrackedLink>
              <p className={s.operatorsMeta}>
                No fee — you receive 100% of what you quoted
                <a href="#footnote-fees" aria-label="See note on card and transfer charges">*</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <HomeFooter />
      {/* Watches the hero: the bar slides up once the widget scrolls away, so
          the ask is never off screen on a phone. 84% of ad clicks are mobile. */}
      <StickyBar href={START_HREF} watch="quote" />
    </div>
  );
}
