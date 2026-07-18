import { jsonLd } from '@/lib/jsonld';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EnquiryForm } from '@/components/enquiry/EnquiryForm';
import { CountyLinks } from '@/components/verticals/CountyLinks';
import { COMPANY_LEGAL_NAME } from '@/lib/site';
import a from '../auth.module.css';
import s from '../landing.module.css';

export const metadata: Metadata = {
  title: 'Tractor Hire for Weddings, Proms & Events',
  description:
    'Hire a tractor and trailer for a wedding, prom, photoshoot or parade — matched with an experienced operator near you across England and Wales. Tell us the occasion and we’ll sort it.',
  alternates: { canonical: '/tractor-hire' },
  openGraph: {
    title: 'Tractor Hire for Weddings, Proms & Events',
    description:
      'Hire a tractor and trailer for a wedding, prom or event — matched with an operator near you.',
  },
};

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Tractor & trailer hire for events',
  serviceType: ['Wedding tractor hire', 'Prom tractor hire', 'Event tractor hire'],
  description:
    'Hire a tractor and trailer with an experienced operator for weddings, proms, photoshoots and events — matched to an operator by area across England and Wales.',
  areaServed: { '@type': 'AdministrativeArea', name: 'England and Wales' },
  provider: {
    '@type': 'Organization',
    name: 'Emmerdale Agriculture',
    legalName: COMPANY_LEGAL_NAME,
    url: 'https://emmerdaleagriculture.com',
  },
};

const faqs = [
  {
    q: 'What can I hire a tractor for?',
    a: 'Weddings (bringing the couple in on a trailer is a favourite), proms, photoshoots, parades, farm-themed parties and promotional events. Tell us the occasion and we’ll match you with someone who can make it happen.',
  },
  {
    q: 'Does it come with a driver?',
    a: 'Yes — an experienced operator drives the tractor. You’re not expected to drive it yourself, and it keeps everything safe and properly insured.',
  },
  {
    q: 'How much does it cost?',
    a: 'It depends on the tractor, how far it needs to travel, and how long you need it. The price is agreed directly with the operator. Send an enquiry with the date and location and we’ll come back with options — no obligation.',
  },
  {
    q: 'Which areas do you cover?',
    a: `We match tractor-hire enquiries with operators across England and Wales. ${COMPANY_LEGAL_NAME} runs the network and passes your enquiry to an operator near you.`,
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

export default function TractorHirePage() {
  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd) }} />
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Tractor hire · Events</div>
          <h1 className={a.title}>
            A tractor for your big day — <em>matched to an operator near you.</em>
          </h1>
          <p className={a.sub}>
            Arriving at your wedding on a tractor and trailer, a vintage tractor for
            the prom, or a proper farm tractor for a photoshoot or parade — tell us
            the occasion and we’ll match you with an experienced operator near you,
            across England and Wales. Driver included, no obligation.
          </p>

          <div className={a.groupTitle}>Send an enquiry</div>
          <EnquiryForm
            category="tractor-hire"
            detailsLabel="What’s the occasion?"
            detailsPlaceholder="e.g. Vintage tractor + trailer to bring the bride to a wedding near SO21 on 14 June — about 2 miles"
            submitLabel="Send tractor enquiry"
          />
        </div>
      </main>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>What it’s for</div>
          <h2 className={s.sectionTitle}>
            A little bit of the countryside, <em>wherever you need it.</em>
          </h2>
          <p className={s.sectionLede}>
            The tractors do the hard graft the rest of the year — but they scrub up
            well for a day out too.
          </p>
          <div className={s.sectionInner} style={{ maxWidth: 760, lineHeight: 1.9 }}>
            <ul>
              <li>
                <strong>Weddings</strong> — arrive (or leave) in style on a decorated
                trailer.
              </li>
              <li>
                <strong>Proms</strong> — a memorable entrance that isn’t another limo.
              </li>
              <li>
                <strong>Photoshoots &amp; film</strong> — an authentic farm tractor on
                set.
              </li>
              <li>
                <strong>Parades, shows &amp; promotions</strong> — a real head-turner.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.sectionTitle}>
            One enquiry, <em>the right operator.</em>
          </h2>
          <p className={s.sectionLede}>
            Send us the date, the place and what you have in mind. We pass it to an
            operator near you, and they get in touch to sort the details and price
            directly with you.
          </p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Common questions</div>
          <h2 className={s.sectionTitle}>
            Tractor hire, <em>answered.</em>
          </h2>
          <div className={s.sectionInner} style={{ maxWidth: 760 }}>
            <dl>
              {faqs.map((f) => (
                <div key={f.q} style={{ padding: '18px 0', borderTop: '1px solid var(--rule)' }}>
                  <dt style={{ fontFamily: 'var(--font-display-stack)', fontSize: 19, color: 'var(--jd-green-deep)', marginBottom: 8 }}>
                    {f.q}
                  </dt>
                  <dd style={{ margin: 0, color: 'var(--ink-2)', lineHeight: 1.6 }}>{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <CountyLinks vertical="tractor-hire" heading="Tractor hire across the country" />

      <SiteFooter />
    </div>
  );
}
