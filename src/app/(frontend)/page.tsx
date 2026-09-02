import { jsonLd } from '@/lib/jsonld';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { HomeHeader, BOOK_HREF } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import { StickyBar } from '@/components/home/StickyBar';
import { DeferredImage } from '@/components/home/DeferredImage';
import { ServiceIcon } from '@/components/home/ServiceIcons';
import { UK_COUNTY_NAMES } from '@/components/UKCoverageMap';
import { HOME_SERVICES } from '@/lib/home/services';
import { getCountyCoverage } from '@/lib/reference';
import {
  COMPANY_LEGAL_NAME,
  COMPANY_NUMBER,
  HPM_URL,
  PHONE_TEL,
  SERVICE_AREA,
} from '@/lib/site';
import s from '@/components/home/home.module.css';

// ISR: statically cached at the CDN, re-rendered at most hourly. The only
// live data on the page is the county coverage feeding the Service schema.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Paddock, land and equestrian jobs, priced upfront',
  description:
    'A managed marketplace for rural land. Paddock, land and equestrian jobs, priced upfront, booked online, completed by approved operators near you.',
  alternates: { canonical: '/' },
};

// Organization schema — credibility signals (company number, HPM relationship).
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Emmerdale Agriculture',
  legalName: COMPANY_LEGAL_NAME,
  url: 'https://emmerdaleagriculture.com',
  // Raster logo (PNG) — Google's logo guidelines don't reliably pick up SVG.
  logo: 'https://emmerdaleagriculture.com/apple-icon.png',
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
  founder: { '@type': 'Person', name: 'Tom Oswald', jobTitle: 'Managing Director' },
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
    `A managed marketplace for rural land, run by ${COMPANY_LEGAL_NAME}, the company behind Hampshire Paddock Management. Paddock, land and equestrian jobs priced upfront and completed by approved operators across ${SERVICE_AREA}.`,
};

/** Where the service cards send people — the describe-your-job flow. */
const START_HREF = '/start';

// Photo strips: one under the intro, one under the service board. Mixed
// aspect ratios in the originals, shown as uniform 4:3 crops; `pos` nudges
// the crop so the machine stays in frame.
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
    src: '/woolton-house.jpg',
    alt: 'A John Deere 4066M compact tractor with a flail mower on the lawns of a country house',
    pos: '50% 55%',
  },
  {
    src: '/john-deere-6250r-kuhn.jpg',
    alt: 'A John Deere 6250R with a Kuhn flail mower on grassland',
    pos: '50% 55%',
  },
];

const GALLERY_2: GalleryPhoto[] = [
  {
    src: '/jcb-fastrac.jpg',
    alt: 'A JCB Fastrac in a field margin, in black and white',
    pos: '50% 60%',
  },
  {
    src: '/john-deere-4066m-pitch.jpg',
    alt: 'A John Deere 4066M with a seeder beside rugby posts on a sports pitch',
    pos: '50% 72%',
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

const TRUST = ['Prices upfront', 'Pay online', 'Vetted and fully trained operators', 'Fully insured'];


export default async function LandingPage() {
  const coverage = await getCountyCoverage();
  const coveredCounties = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0);

  // Service schema — what can be booked, where, and the route to a price.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Paddock maintenance & land services',
    serviceType: HOME_SERVICES.map((svc) => svc.name),
    description:
      `Paddock maintenance and agricultural contracting, including topping, harrowing, rolling, overseeding, hedge cutting, fencing and land clearance, for paddock owners, equestrian yards, farms and estates across ${SERVICE_AREA}. Priced upfront and completed by approved operators.`,
    url: `https://emmerdaleagriculture.com${BOOK_HREF}`,
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
        dangerouslySetInnerHTML={{ __html: jsonLd(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }}
      />

      <a className={s.skip} href="#main">
        Skip to main content
      </a>

      <HomeHeader />

      <div className={s.trust} role="region" aria-label="Trust signals">
        <div className={s.container}>
          <ul className={s.trustList}>
            {TRUST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>

      <main id="main">
        {/* Tom leads the page. */}
        <section className={s.intro} id="about">
          <div className={s.container}>
            <div className={s.founder}>
              <figure className={s.founderPhoto}>
                <Image
                  src="/tom-oswald.jpg"
                  alt="Tom Oswald standing in front of a John Deere 9RX 830 tractor"
                  fill
                  priority
                  quality={65}
                  sizes="(min-width: 900px) 420px, 100vw"
                  className={s.founderImg}
                />
              </figure>
              <div className={s.founderText}>
                <p className={s.eyebrow}>A managed marketplace for rural land</p>
                <h1 className={s.founderH1}>Hi, I&rsquo;m Tom Oswald.</h1>
                <p>
                  I&rsquo;m the managing director of Emmerdaleagriculture.com. I
                  started{' '}
                  <a href={HPM_URL} className={s.founderLink}>
                    <strong>Hampshire Paddock Management</strong>
                  </a>{' '}
                  looking
                  after paddocks, smallholdings and grassland across the South
                  of England, topping, harrowing, rolling, hedges, the everyday
                  work that keeps land in good order.
                </p>
                <p>
                  The enquiries never stopped coming, and one firm can only be
                  in so many fields at once. So we grew into{' '}
                  <strong>Emmerdale Agriculture</strong>, the same standard
                  of work, delivered across the UK by approved
                  operators we know and trust. You get one price, one booking
                  and one place to come back to; they do the work they&rsquo;re
                  best at, close to home.
                </p>
                <p className={s.founderSig}>Tom Oswald · Managing Director</p>
              </div>
            </div>
          </div>
        </section>

        <PhotoStrip photos={GALLERY} label="Our work" />

        {/* Full service board. */}
        <section id="services" className={s.services}>
          <div className={s.container}>
            <p className={s.eyebrow}>What we do</p>
            <h2 className={s.sectionH} style={{ marginBottom: 6 }}>
              Everything we do
            </h2>
            <p className={s.servicesSub}>
              Tap a card, tell us what needs doing and we&rsquo;ll come back
              with a price. Free, and no obligation.
            </p>
            <div className={s.servicesGrid}>
              {HOME_SERVICES.map((svc) => (
                <article key={svc.slug} className={s.service}>
                  <div className={s.serviceIcon}>
                    <ServiceIcon icon={svc.icon} />
                  </div>
                  <h3 className={s.serviceName}>{svc.name}</h3>
                  <p className={s.serviceBlurb}>{svc.blurb}</p>
                  <Link href={START_HREF} className={s.serviceLink}>
                    <span className={s.serviceLinkText}>Get a price →</span>
                    <span className={s.visuallyHidden}> for {svc.label}</span>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <PhotoStrip photos={GALLERY_2} label="More of our work" />

        {/* Editorial photo band. */}
        <section className={s.band} aria-label="Approved operators">
          {/* Deferred until near the viewport so it never competes with the
              founder photo (the LCP) for bandwidth. Under a dark scrim and
              cropped to a 420px strip, so a 1200px source at modest quality
              is indistinguishable from the 1920px one Lighthouse flagged. */}
          <DeferredImage
            src="/john-deere-6250r.webp"
            alt="A John Deere 6250R working in a Hampshire field"
            fill
            quality={60}
            sizes="(min-width: 1200px) 1200px, 100vw"
            className={s.bandImg}
          />
          <div className={s.bandScrim} />
          <div className={`${s.container} ${s.bandInner}`}>
            <blockquote className={s.bandQuote}>
              Every job is done by an operator we&rsquo;ve vetted, insured and
              reviewed.
            </blockquote>
          </div>
        </section>

        {/* Operators band. */}
        <section id="operators" className={s.operators}>
          <div className={`${s.container} ${s.operatorsGrid}`}>
            <div>
              <p className={`${s.eyebrow} ${s.eyebrowLight}`}>For operators</p>
              <h2 className={`${s.sectionH} ${s.operatorsH}`}>
                Do you run an agricultural contracting business?
              </h2>
              <p className={s.operatorsCopy}>
                Join our network of approved operators. We bring you the
                customer and handle the payment, you set your own price and do
                the work you&rsquo;re good at.
              </p>
            </div>
            <div className={s.operatorsCta}>
              <Link href="/signup" className={`${s.btn} ${s.btnLg} ${s.btnOutlineLight}`}>
                Apply to join
              </Link>
              <p className={s.operatorsMeta}>
                No fee, you receive 100% of what you quoted
                <a href="#footnote-fees" aria-label="See note on card and transfer charges">*</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <HomeFooter />
      <StickyBar href={BOOK_HREF} watch="about" />
    </div>
  );
}
