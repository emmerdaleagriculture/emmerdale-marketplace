import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getServices } from '@/lib/reference';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER, HPM_URL } from '@/lib/site';
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
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Emmerdale Agriculture Ltd',
  url: 'https://emmerdaleagriculture.com',
  logo: 'https://emmerdaleagriculture.com/icon.svg',
  identifier: {
    '@type': 'PropertyValue',
    propertyID: 'Company Number',
    value: COMPANY_NUMBER,
  },
  sameAs: [HPM_URL],
  description:
    'The contractor network run by Emmerdale Agriculture Ltd, the company behind Hampshire Paddock Management. Paddock and land jobs matched to contractors by county and awarded by bid.',
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
  const services = await getServices();

  return (
    <div className={s.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
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

      <SiteFooter />
    </div>
  );
}
