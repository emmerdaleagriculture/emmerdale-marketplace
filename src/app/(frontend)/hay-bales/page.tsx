import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EnquiryForm } from '@/components/enquiry/EnquiryForm';
import { COMPANY_LEGAL_NAME } from '@/lib/site';
import a from '../auth.module.css';
import s from '../landing.module.css';

export const metadata: Metadata = {
  title: 'Hay, Straw & Haylage Suppliers — Matched Near You',
  description:
    'Looking for hay, straw or haylage? Tell us what you need and we’ll match you with a supplier near you across England and Wales — big bales or small, delivered or collected.',
  alternates: { canonical: '/hay-bales' },
  openGraph: {
    title: 'Hay, Straw & Haylage Suppliers — Matched Near You',
    description:
      'Tell us what you need and we’ll match you with a hay, straw or haylage supplier near you.',
  },
};

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Hay, straw & haylage supply',
  serviceType: ['Hay supply', 'Straw supply', 'Haylage supply'],
  description:
    'Sourcing hay, straw and haylage for horse owners, smallholders, farms and equestrian yards — matched to suppliers by area across England and Wales.',
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
    q: 'What can you supply?',
    a: 'Meadow and seed hay, barley and wheat straw, and haylage — in big square or round bales, or conventional small bales. Tell us the type, quantity and how you’d like it delivered or collected, and we’ll match you with a supplier who has it.',
  },
  {
    q: 'Do you deliver hay and straw?',
    a: 'Many of our suppliers deliver locally; some offer collection only. Put your postcode on the enquiry and we’ll match you with someone who can get it to you.',
  },
  {
    q: 'How much does it cost?',
    a: 'Price depends on the forage type, bale size, quantity and your location, and it’s agreed directly with the supplier. Send an enquiry and we’ll come back to you with options — there’s no obligation.',
  },
  {
    q: 'Which areas do you cover?',
    a: `We match hay, straw and haylage enquiries with suppliers across England and Wales. ${COMPANY_LEGAL_NAME} runs the network and passes your enquiry to the right supplier for your area.`,
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

export default function HayBalesPage() {
  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Hay · Straw · Haylage</div>
          <h1 className={a.title}>
            Hay, straw &amp; haylage — <em>matched to a supplier near you.</em>
          </h1>
          <p className={a.sub}>
            Whether you need a few small bales for the ponies or a full load of big
            bales for the yard, tell us what you’re after and we’ll match you with a
            supplier near you. Delivered or collected, across England and Wales — no
            obligation.
          </p>

          <div className={a.groupTitle}>Send an enquiry</div>
          <EnquiryForm
            category="hay"
            detailsLabel="What do you need?"
            detailsPlaceholder="e.g. 20 large square bales of meadow hay, delivered near SO23 — needed within 2 weeks"
            submitLabel="Send hay enquiry"
          />
        </div>
      </main>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>What we supply</div>
          <h2 className={s.sectionTitle}>
            Forage for horses, livestock <em>and land.</em>
          </h2>
          <p className={s.sectionLede}>
            Hay for horses and smallholdings, straw for bedding, and haylage for
            harder-keeping animals — in whatever bale size suits you.
          </p>
          <div className={s.sectionInner} style={{ maxWidth: 760, lineHeight: 1.9 }}>
            <ul>
              <li>
                <strong>Hay</strong> — meadow and seed hay, small or big bales.
              </li>
              <li>
                <strong>Straw</strong> — barley and wheat straw for bedding.
              </li>
              <li>
                <strong>Haylage</strong> — wrapped bales for horses and livestock.
              </li>
              <li>
                <strong>By the load or the trailer-full</strong> — small quantities
                for private owners through to bulk for yards and farms.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.sectionTitle}>
            One enquiry, <em>the right supplier.</em>
          </h2>
          <p className={s.sectionLede}>
            Send us what you need and where you are. We pass it to a supplier who can
            help, and they get in touch to sort quantity, price and delivery directly
            with you.
          </p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Common questions</div>
          <h2 className={s.sectionTitle}>
            Hay &amp; straw, <em>answered.</em>
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

      <SiteFooter />
    </div>
  );
}
