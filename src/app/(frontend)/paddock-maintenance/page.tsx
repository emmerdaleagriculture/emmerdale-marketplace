import { jsonLd } from '@/lib/jsonld';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { StartJobForm } from './StartJobForm';
import { CountyLinks } from '@/components/verticals/CountyLinks';
import { NotesTeaser } from '@/components/notes/NotesTeaser';
import {
  ServicesSection,
  HowItWorksSection,
  CredSection,
  FaqSection,
  faqSchema,
} from '@/components/paddock/PaddockSections';
import { getServices, getCountyCoverage } from '@/lib/reference';
import { UK_COUNTY_NAMES } from '@/components/UKCoverageMap';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER, SERVICE_AREA } from '@/lib/site';
import a from '../auth.module.css';
import s from '../landing.module.css';

/**
 * The customer front page: the indexable front door for people who need
 * paddock or field work done, feeding straight into the /start flow.
 *
 * /start itself is noindex by design (it's the paid-ads landing page), so
 * organic search intent had nowhere of its own to land — the homepage sells
 * the network to contractors, and the only customer route out of it was
 * off-site to HPM. This page takes that traffic, asks step 1's two questions
 * in place, and hands the answers to the flow.
 */

// ISR: the only data here is the service taxonomy and live county coverage.
export const revalidate = 3600;

const TITLE = 'Paddock Maintenance & Field Topping — Get a Quote';
const DESCRIPTION =
  'Overgrown paddock or field that needs putting right? Describe the job in your own words and we’ll pass it to agricultural contractors covering your area. Topping, harrowing, rolling, spraying, hedge cutting and more — free, no obligation.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/paddock-maintenance' },
  openGraph: {
    title: TITLE,
    description:
      'Describe your paddock or field job in your own words — we’ll pass it to contractors covering your area. Free, no obligation.',
  },
};

const faqs = [
  {
    q: 'What counts as paddock maintenance?',
    a: 'The everyday work of keeping grassland right: topping long or seeded grass, chain harrowing to pull out dead thatch, rolling after a wet winter, spraying docks, nettles, thistles and ragwort, hedge cutting, fencing, and clearing land that’s got away from you. If you’re not sure what your field needs, describe what it looks like — the contractor will tell you.',
  },
  {
    q: 'How much does it cost?',
    a: 'It depends on the acreage, the state of the ground, access for machinery and how far the contractor travels — so the price comes from the contractor who’d do the work, not from us. Describing the job takes a minute, quotes are free and there’s no obligation to accept one.',
  },
  {
    q: 'How quickly will someone get in touch?',
    a: 'Your job goes out to contractors covering your county as soon as we’ve checked it. Most jobs are picked up within a day or two, though it depends on the season — topping in high summer and hedge cutting after the nesting season are the busy times.',
  },
  {
    q: 'How small a job will you take?',
    a: 'A single pony paddock is a perfectly normal job. We handle work for private paddock owners and one-horse fields through to equestrian yards, smallholdings, farms and estates.',
  },
  {
    q: 'Do I need to know the acreage?',
    a: 'No. Give us a rough idea — “about two football pitches”, “a bit over an acre” — or just the postcode and a description. We work the details out and confirm them with you before anything goes to a contractor.',
  },
  {
    q: 'Who actually does the work?',
    a: `The work is done by agricultural contractors in our network, which is run by ${COMPANY_LEGAL_NAME} (Company No. ${COMPANY_NUMBER}) — the company behind Hampshire Paddock Management. You deal with the contractor directly and pay them directly.`,
  },
];

export default async function PaddockMaintenancePage() {
  const [services, coverage] = await Promise.all([getServices(), getCountyCoverage()]);
  const coveredCount = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0).length;

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Paddock maintenance & field work',
    serviceType: services.map((svc) => svc.name),
    description:
      `Paddock maintenance and agricultural contracting for paddock owners, equestrian yards, smallholdings, farms and estates — field topping, chain harrowing, rolling, weed spraying, hedge cutting, fencing and land clearance, matched to contractors by county across ${SERVICE_AREA}.`,
    url: 'https://emmerdaleagriculture.com/paddock-maintenance',
    areaServed: { '@type': 'AdministrativeArea', name: SERVICE_AREA },
    provider: {
      '@type': 'Organization',
      name: 'Emmerdale Agriculture',
      legalName: COMPANY_LEGAL_NAME,
      url: 'https://emmerdaleagriculture.com',
    },
  };

  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb items={[{ label: 'Paddock maintenance' }]} />
          <div className={a.eyebrow}>Paddock &amp; field work</div>
          <h1 className={a.title}>
            Paddock maintenance — <em>tell us what needs doing.</em>
          </h1>
          <p className={a.sub}>
            An overgrown paddock, a field of docks and nettles, grass that got
            away from you over the summer. Describe it in your own words and
            we&rsquo;ll pass it to agricultural contractors covering your area —
            free, and with no obligation to accept a quote.
          </p>

          <StartJobForm />
        </div>
      </main>

      <ServicesSection
        alt
        services={services}
        title={
          <>
            Everything a paddock needs, <em>done properly.</em>
          </>
        }
        lede="The full range of paddock maintenance and land work, for anything from a single pony paddock to a whole estate."
      />

      <HowItWorksSection
        title={
          <>
            One description, <em>the right contractor.</em>
          </>
        }
        lede={
          <>
            You don&rsquo;t need to know the machinery, the acreage or the
            technical term for the job. That&rsquo;s our end.
          </>
        }
      />

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Where we cover</div>
          <h2 className={s.sectionTitle}>
            Contractors in {coveredCount} counties — <em>and growing.</em>
          </h2>
          <p className={s.sectionLede}>
            The network runs across {SERVICE_AREA}, deepest around our
            Hampshire heartland and spreading out from there. If your county is
            thin on the ground we&rsquo;ll tell you straight rather than leave
            you waiting — and it costs nothing to ask.
          </p>
        </div>
      </section>

      <CredSection />

      <FaqSection
        faqs={faqs}
        title={
          <>
            Paddock work, <em>answered.</em>
          </>
        }
      >
        <p className={s.sectionLede} style={{ marginTop: 32 }}>
          Also looking for <Link href="/hay-bales">hay, straw or haylage</Link>, or{' '}
          <Link href="/tractor-hire">a tractor for an event</Link>? And if you&rsquo;re
          a contractor rather than a customer,{' '}
          <Link href="/signup">join the network</Link> — it&rsquo;s free.
        </p>
      </FaqSection>

      <NotesTeaser
        service="paddock-maintenance"
        alt
        fillWithRecent
        heading={
          <>
            Written from <em>the seat of a tractor.</em>
          </>
        }
        lede="What paddocks actually need, season by season — the same work the contractors in the network do every week."
      />

      <CountyLinks
        vertical="paddock-maintenance"
        heading="Paddock maintenance, county by county"
      />

      <SiteFooter />
    </div>
  );
}
