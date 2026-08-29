import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { jsonLd } from '@/lib/jsonld';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { StartJobForm } from '../StartJobForm';
import {
  ServicesSection,
  HowItWorksSection,
  CredSection,
  FaqSection,
  faqSchema,
  type Faq,
} from '@/components/paddock/PaddockSections';
import { allCountyRefs, resolveCountyBySlug, regionPhrase, type CountyRef } from '@/lib/verticals';
import { getServices, getCountyCoverage } from '@/lib/reference';
import { paddockNote } from '@/lib/paddockRegions';
import { COMPANY_LEGAL_NAME } from '@/lib/site';
import a from '../../auth.module.css';
import s from '../../landing.module.css';

/**
 * Per-county paddock maintenance pages — the organic catch for "paddock
 * maintenance in <county>" style searches, feeding the same /start flow as the
 * front page.
 *
 * Indexing differs deliberately from the hay/tractor county pages, which
 * noindex counties with no contractors: a paddock job in an uncovered county
 * still has somewhere to go (the flow captures it, and the demand is what
 * recruits contractors there), so these are indexable everywhere. The trade
 * that makes that defensible rather than doorway-spam is real per-county
 * content — live coverage, region, neighbours and ground notes — instead of 88
 * copies with the name swapped.
 */
export const dynamicParams = false;
// Daily, so coverage counts track the network without a redeploy.
export const revalidate = 86400;

export async function generateStaticParams() {
  const refs = await allCountyRefs();
  return refs.map((c) => ({ county: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string }>;
}): Promise<Metadata> {
  const { county } = await params;
  const resolved = await resolveCountyBySlug(county);
  if (!resolved) return {};
  const name = resolved.county.name;
  const title = `Paddock Maintenance in ${name} — Topping, Harrowing & Spraying`;
  const description = `Need a paddock or field sorted in ${name}? Describe the job in your own words and we’ll pass it to agricultural contractors covering ${name} — topping, chain harrowing, rolling, weed spraying, hedge cutting and fencing. Free, no obligation.`;
  return {
    title,
    description,
    alternates: { canonical: `/paddock-maintenance/${county}` },
    openGraph: { title, description },
  };
}

function countyFaqs(name: string, region: string, coverage: number): Faq[] {
  return [
    {
      q: `Who does paddock maintenance in ${name}?`,
      a:
        coverage > 0
          ? `We pass jobs to agricultural contractors covering ${name} — ${coverage} of them are in the network today. Describe what needs doing and the ones who cover your area get in touch with you directly.`
          : `We match paddock work in ${name} with agricultural contractors covering ${regionPhrase(region)}. Coverage grows as contractors join, so send the job through and we’ll tell you honestly where we stand in your area — there’s no obligation either way.`,
    },
    {
      q: `How much does paddock topping cost in ${name}?`,
      a: `It depends on the acreage, how heavy the growth is, how good the access is for machinery and how far the contractor travels to reach you — so the price comes from the contractor who’d do the work, not from us. Describing the job takes a minute and quotes are free.`,
    },
    {
      q: `Will someone come out to a small paddock in ${name}?`,
      a: `Yes — a single pony paddock is a perfectly normal job. We handle work for private paddock owners and one-horse fields through to equestrian yards, smallholdings, farms and estates across ${name}.`,
    },
    {
      q: `What if my field is in ${name} but near the border?`,
      a: `Not a problem. Give us the postcode and we’ll match on where the field actually is — contractors work across county lines all the time, and plenty cover more than one county.`,
    },
    {
      q: 'Who runs this?',
      a: `${COMPANY_LEGAL_NAME}, the company behind Hampshire Paddock Management — a contracting firm that does paddock work every day. You deal with the contractor directly and pay them directly; we take no commission.`,
    },
  ];
}

export default async function PaddockCountyPage({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county } = await params;
  const resolved = await resolveCountyBySlug(county);
  if (!resolved) notFound();

  const [services, coverageMap] = await Promise.all([getServices(), getCountyCoverage()]);
  const { county: ref, siblings } = resolved;
  const name = ref.name;
  const coverage = coverageMap[name] ?? 0;
  const note = paddockNote(name, ref.region);
  const faqs = countyFaqs(name, ref.region, coverage);

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Paddock maintenance in ${name}`,
    serviceType: services.map((svc) => svc.name),
    description: `Paddock maintenance and agricultural contracting in ${name} — field topping, chain harrowing, rolling, weed spraying, hedge cutting, fencing and land clearance for paddock owners, equestrian yards, smallholdings, farms and estates.`,
    url: `https://emmerdaleagriculture.com/paddock-maintenance/${county}`,
    areaServed: { '@type': 'AdministrativeArea', name },
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
          <Breadcrumb
            items={[
              { label: 'Paddock maintenance', href: '/paddock-maintenance' },
              { label: name },
            ]}
          />
          <div className={a.eyebrow}>Paddock &amp; field work · {name}</div>
          <h1 className={a.title}>
            Paddock maintenance in {name} — <em>tell us what needs doing.</em>
          </h1>
          <p className={a.sub}>
            An overgrown paddock, a field of docks and nettles, grass that got
            away from you over the summer. Describe it in your own words and
            we&rsquo;ll pass it to agricultural contractors covering {name} —
            free, and with no obligation to accept a quote.
          </p>

          <p className={a.sub} style={{ marginTop: -6 }}>
            {coverage > 0 ? (
              <>
                <strong>
                  {coverage} {coverage === 1 ? 'contractor' : 'contractors'}
                </strong>{' '}
                in the network already cover {name}
                {name === ref.region ? '' : `, in ${regionPhrase(ref.region)}`}. Send the
                job through and whoever&rsquo;s keen gets in touch with you directly.
              </>
            ) : (
              <>
                We&rsquo;re still building coverage in {name}
                {name === ref.region ? '' : ` and across ${regionPhrase(ref.region)}`}.
                Send the job through anyway — we&rsquo;ll tell you
                straight where we stand rather than leave you waiting, and jobs
                coming in are exactly how we bring contractors into a new area.
              </>
            )}
          </p>

          <StartJobForm />
        </div>
      </main>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>The ground</div>
          <h2 className={s.sectionTitle}>
            Grazing ground in {name}, <em>and what it needs.</em>
          </h2>
          <div className={s.sectionInner} style={{ maxWidth: 760 }}>
            <p className={s.sectionLede}>{note.ground}</p>
            <p className={s.sectionLede}>{note.timing}</p>
            <p className={s.sectionLede}>
              Not sure which of those your field needs? Describe what it looks
              like and the contractor will tell you — that&rsquo;s their job, not
              yours.
            </p>
          </div>
        </div>
      </section>

      <ServicesSection
        services={services}
        title={
          <>
            What we sort in {name}, <em>whatever the field needs.</em>
          </>
        }
        lede={`The full range of paddock maintenance and land work, for anything from a single pony paddock to a whole estate.`}
      />

      <HowItWorksSection
        alt
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

      <CredSection />

      <FaqSection
        faqs={faqs}
        title={
          <>
            Paddock work in {name}, <em>answered.</em>
          </>
        }
      />

      {siblings.length > 0 && (
        <section className={`${s.section} ${s.sectionAlt}`}>
          <div className={s.sectionInner}>
            <div className={s.kicker}>Nearby counties</div>
            <h2 className={s.sectionTitle}>
              Also covering the <em>rest of {regionPhrase(ref.region)}.</em>
            </h2>
            <div
              className={s.sectionInner}
              style={{ maxWidth: 760, display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}
            >
              {siblings.map((c: CountyRef) => (
                <Link key={c.slug} href={`/paddock-maintenance/${c.slug}`}>
                  {c.name}
                </Link>
              ))}
            </div>
            <p className={s.sectionLede} style={{ marginTop: 24 }}>
              <Link href="/paddock-maintenance">Every county we cover →</Link>
            </p>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
