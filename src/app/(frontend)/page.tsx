import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { UKCoverageMap, COVERAGE_BINS, UK_COUNTY_NAMES } from '@/components/UKCoverageMap';
import { getServices, getCountyCoverage } from '@/lib/reference';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER, HPM_URL, HPM_CONTACT_URL } from '@/lib/site';
import s from './landing.module.css';
import f from '@/components/forms/forms.module.css';

// ISR: statically cached at the CDN, re-rendered at most hourly. The only data
// on the page (the 15-service taxonomy) is effectively fixed.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Paddock & Agricultural Contractor Jobs | Emmerdale Agriculture',
  description:
    'Free-to-join network passing paddock maintenance and land jobs to agricultural contractors across England and Wales. Get matched by county, bid, and win the work — no commission.',
  alternates: { canonical: '/' },
};

// Organization schema — credibility signals (company number, HPM relationship).
// The network itself is nationwide (England & Wales), so areaServed is national
// — not the regional service area of the HPM contracting arm.
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Emmerdale Agriculture',
  legalName: COMPANY_LEGAL_NAME,
  url: 'https://emmerdaleagriculture.com',
  // Raster logo (PNG) — Google's logo guidelines don't reliably pick up SVG.
  logo: 'https://emmerdaleagriculture.com/apple-icon.png',
  identifier: {
    '@type': 'PropertyValue',
    propertyID: 'Company Number',
    value: COMPANY_NUMBER,
  },
  areaServed: { '@type': 'AdministrativeArea', name: 'England and Wales' },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    url: HPM_CONTACT_URL,
    areaServed: 'GB',
    availableLanguage: 'English',
  },
  sameAs: [HPM_URL],
  description:
    'The contractor network run by Emmerdale Agriculture Ltd, the company behind Hampshire Paddock Management. Paddock and land jobs matched to contractors by county across England and Wales and awarded by bid.',
};

// FAQ schema — mirrors the visible FAQ section below (Google requires the
// answers to be on-page). Kept nationwide in framing.
const faqs = [
  {
    q: 'Does it cost anything to join the network?',
    a: 'No. Joining is completely free and there’s no obligation to bid. You only ever deal directly with the customer when you win a job — Emmerdale Agriculture takes no commission.',
  },
  {
    q: 'How are jobs matched to me?',
    a: 'By county. You choose the counties you cover when you join, and whenever a job is posted in one of them we email you the details — the town, the work needed, and when bidding closes.',
  },
  {
    q: 'Do you take a cut of the work?',
    a: 'No. When you win a job you get the customer’s details and arrange the work directly. You invoice them yourself and keep the full amount — we take no commission.',
  },
  {
    q: 'Which parts of the country do you cover?',
    a: 'The network is nationwide across England and Wales. Coverage grows as more contractors join, and you’ll be matched to jobs in whichever counties you choose.',
  },
  {
    q: 'Who runs Emmerdale Agriculture?',
    a: `The network is run by ${COMPANY_LEGAL_NAME} (Company No. ${COMPANY_NUMBER}), the company behind Hampshire Paddock Management — a contracting firm that does this work every day and passes on the jobs it can’t take.`,
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

const STEPS = [
  {
    n: 1,
    title: 'Sign up & choose your counties',
    body: 'Tell us what you do and where you work. Pick your counties by region in a couple of clicks.',
  },
  {
    n: 2,
    title: 'Get matched by county',
    body: 'When a job lands in one of your counties, we email you the details — town, work needed, and when bidding closes.',
  },
  {
    n: 3,
    title: 'Bid and win the work',
    body: 'Put in your price. Win the job and you get the customer’s details to arrange it directly. You invoice them — we take no cut.',
  },
];

export default async function LandingPage() {
  const [services, coverage] = await Promise.all([getServices(), getCountyCoverage()]);
  const coveredCounties = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0);
  const coveredCount = coveredCounties.length;

  // Service schema — the customer-search side: what work can be quoted, where,
  // and the route to a quote. areaServed tracks live network coverage.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Paddock maintenance & land services',
    serviceType: services.map((svc) => svc.name),
    description:
      'Free, no-obligation quotes for paddock maintenance and agricultural contracting — field topping, chain harrowing, rolling, weed spraying, hedge cutting, fencing and land clearance — for paddock owners, equestrian yards, farms and estates across Hampshire and the South of England.',
    url: HPM_CONTACT_URL,
    provider: {
      '@type': 'Organization',
      name: COMPANY_LEGAL_NAME,
      url: 'https://emmerdaleagriculture.com',
      brand: { '@type': 'Brand', name: 'Hampshire Paddock Management' },
    },
    areaServed: coveredCounties.map((name) => ({ '@type': 'AdministrativeArea', name })),
  };

  return (
    <div className={s.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className={s.hero}>
        <Image
          src="/john-deere-6250r.webp"
          alt="A John Deere 6250R working in a Hampshire field"
          fill
          priority
          quality={70}
          sizes="100vw"
          className={s.heroImg}
        />
        <div className={s.heroOverlay} />
        <SiteHeader variant="overlay" />
        <div className={s.heroInner}>
          <div className={s.eyebrow}>The network</div>
          <h1 className={s.h1}>
            Paddock and land jobs across the country, passed to contractors who can{' '}
            <em>actually do them.</em>
          </h1>
          <p className={s.heroSub}>
            Hampshire Paddock Management turns away more work than it can service.
            That overflow goes to the network — matched to contractors by county,
            awarded by bid.
          </p>
          <div className={s.heroCtas}>
            <Link href="/signup" className={f.btnYellow}>
              Join the network — free
            </Link>
            <Link href="/#how-it-works" className={f.btnGhost} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.sectionTitle}>
            Three steps to <em>winning work.</em>
          </h2>
          <p className={s.sectionLede}>
            No cost to join. No obligation to bid. Just jobs in your area when they
            come up.
          </p>
          <div className={s.steps}>
            {STEPS.map((step) => (
              <div key={step.n} className={s.step}>
                <div className={s.stepNum}>{step.n}</div>
                <div className={s.stepTitle}>{step.title}</div>
                <p className={s.stepBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>The work</div>
          <h2 className={s.sectionTitle}>Paddock maintenance &amp; land services</h2>
          <p className={s.sectionLede}>
            The jobs posted to the network span the full range of paddock
            maintenance and land work.
          </p>
          <div className={s.services}>
            {services.map((svc) => (
              <span key={svc.id} className={s.serviceTag}>
                {svc.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Where we cover</div>
          <h2 className={s.sectionTitle}>
            Contractors in {coveredCount} counties — <em>and growing.</em>
          </h2>
          <div className={s.coverage}>
            <div className={s.coverageMapCol}>
              <UKCoverageMap
                counts={coverage}
                className={s.coverageMap}
                pathClassName={s.coverageCounty}
              />
              <div className={s.coverageLegend}>
                {COVERAGE_BINS.map((b) => (
                  <span key={b.label} className={s.coverageLegendItem}>
                    <span className={s.coverageSwatch} style={{ background: b.fill }} />
                    {b.publicLabel}
                  </span>
                ))}
              </div>
            </div>
            <div className={s.coverageText}>
              <p className={s.sectionLede}>
                Every green county on the map has approved contractors in the
                network today — deepest around our Hampshire heartland and
                spreading across the South of England.
              </p>
              <p className={s.sectionLede}>
                Work somewhere still grey? Even better. Jobs are matched to the
                counties you choose, so contractors in new areas are first in
                line the moment work comes up there.
              </p>
              <Link href="/signup" className={f.btnPrimary}>
                Cover your county — join free
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Need a job done?</div>
          <h2 className={s.sectionTitle}>
            Paddock or land work to be done? <em>Get a quote.</em>
          </h2>
          <p className={s.sectionLede}>
            If you own a paddock, smallholding or grassland and need work done —
            field topping, chain harrowing, rolling, weed spraying, hedge
            cutting, fencing or land clearance — you don&apos;t need to join the
            network. Request a free, no-obligation quote from{' '}
            <a href={HPM_CONTACT_URL}>Hampshire Paddock Management</a>, the
            contracting firm behind Emmerdale Agriculture, and we&apos;ll price
            the job and put the right people on it.
          </p>
          <p className={s.sectionLede}>
            Based in Hampshire and working across the South of England, we
            handle paddock maintenance and agricultural contracting for private
            paddock owners, equestrian yards, farms and estates alike.
          </p>
          <div className={s.quoteCta}>
            <a href={HPM_CONTACT_URL} className={f.btnYellow}>
              Get a free quote
            </a>
          </div>
        </div>
      </section>

      <section className={s.cred}>
        <div className={s.credInner}>
          <h2 className={s.credTitle}>
            Run by a firm that does this work <em>every day.</em>
          </h2>
          <p className={s.credBody}>
            The network exists because {COMPANY_LEGAL_NAME} — the company behind{' '}
            <a href={HPM_URL}>Hampshire Paddock Management</a> — receives more
            enquiries than it can take on. Rather than turn good jobs away, we pass
            them to vetted contractors who can do them.
          </p>
          <p className={s.credMeta}>
            {COMPANY_LEGAL_NAME} · Company No. {COMPANY_NUMBER}
          </p>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>For contractors</div>
          <h2 className={s.sectionTitle}>
            Agricultural contracting work, found <em>for you.</em>
          </h2>
          <p className={s.sectionLede}>
            Emmerdale Agriculture passes real, consented enquiries to agricultural
            contractors across England and Wales — the everyday work of grassland
            and paddock maintenance: topping, harrowing, rolling, spraying,
            rotavating, land clearance and more, matched to the counties you choose.
          </p>
          <p className={s.sectionLede}>
            Whether you’re an established contractor filling gaps in the diary or a
            growing smallholder-services business, the network sends paddock
            maintenance jobs in your area straight to your inbox. Free to join, no
            obligation to bid, no commission — you win the job, you invoice the
            customer.
          </p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.teaser}>
          <div className={s.teaserTitle}>
            Or get <em>direct access</em> to every job
          </div>
          <p className={s.teaserBody}>
            Paid members see every job in their counties 12 hours before anyone
            else — full details including customer contact, no bidding.
          </p>
          <p className={s.teaserBody}>
            <strong>£20/month.</strong> See every job twelve hours early — and skip
            the bidding entirely.
          </p>
          <p className={s.teaserNote}>Coming soon. Join free now and we’ll tell you when it launches.</p>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Common questions</div>
          <h2 className={s.sectionTitle}>
            Questions, <em>answered.</em>
          </h2>
          <dl className={s.faq}>
            {faqs.map((f) => (
              <div key={f.q} className={s.faqItem}>
                <dt className={s.faqQ}>{f.q}</dt>
                <dd className={s.faqA}>{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
