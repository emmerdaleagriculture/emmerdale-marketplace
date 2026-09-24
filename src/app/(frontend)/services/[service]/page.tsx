import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { FaqSection, faqSchema } from '@/components/paddock/PaddockSections';
import { ServicePostcodeForm } from '@/components/services/ServicePostcodeForm';
import { jsonLd } from '@/lib/jsonld';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { SERVICE_PAGES, servicePageByPath, cardFor, servicePagePath } from '@/lib/services';
import { HOME_SERVICES } from '@/lib/home/services';
import { COMPANY_LEGAL_NAME, SERVICE_AREA, siteUrl } from '@/lib/site';
import a from '../../auth.module.css';
import s from '../../landing.module.css';
import t from '../services.module.css';

const SITE = siteUrl();

// Content is static; the booked prices refresh hourly.
export const revalidate = 3600;
export const dynamicParams = false;

type Params = { service: string };

export function generateStaticParams(): Params[] {
  return SERVICE_PAGES.map((p) => ({ service: p.path }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = servicePageByPath((await params).service);
  if (!page) return { title: 'Not found' };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/services/${page.path}` },
    openGraph: { title: page.metaTitle, description: page.metaDescription },
  };
}

/**
 * What this job has actually cost when booked through us — the same source as
 * the home page board (recent_work), filtered to this service's rows. Real
 * figures or nothing: never a band, never padded.
 */
async function bookedPrices(names: string[]): Promise<number[]> {
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await client
      .from('recent_work')
      .select('amount_pence')
      .in('service_name', names)
      .order('ord', { ascending: true })
      .limit(6);
    return ((data ?? []) as { amount_pence: unknown }[])
      .map((r) => r.amount_pence)
      .filter((n): n is number => typeof n === 'number' && n > 0);
  } catch {
    return [];
  }
}


export default async function ServicePage({ params }: { params: Promise<Params> }) {
  const page = servicePageByPath((await params).service);
  if (!page) notFound();
  const card = cardFor(page);
  const prices = await bookedPrices(page.canonical);
  const url = `${SITE}/services/${page.path}`;

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: card.name,
    serviceType: page.canonical,
    description: page.intro,
    url,
    areaServed: { '@type': 'AdministrativeArea', name: SERVICE_AREA },
    provider: { '@type': 'Organization', name: 'Emmerdale Agriculture', legalName: COMPANY_LEGAL_NAME, url: SITE },
  };

  const related = page.related
    .map((slug) => {
      const c = HOME_SERVICES.find((x) => x.slug === slug);
      const href = servicePagePath(slug);
      return c && href ? { name: c.name, blurb: c.blurb, href } : null;
    })
    .filter((x): x is { name: string; blurb: string; href: string } => x !== null);

  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(page.faqs)) }} />
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb tone="light" items={[{ label: 'Services', href: '/services' }, { label: card.name }]} />
          <div className={a.eyebrow}>{card.name}</div>
          <h1 className={a.title}>{page.h1}</h1>
          <p className={a.sub}>{page.intro}</p>
          <ServicePostcodeForm slug={card.slug} name={card.name} />
        </div>
      </main>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>The work</div>
          <h2 className={s.sectionTitle}>What&rsquo;s involved</h2>
          {page.involves.map((p) => (
            <p key={p} className={t.prose}>{p}</p>
          ))}
          <h2 className={s.sectionTitle}>When to do it</h2>
          {page.when.map((p) => (
            <p key={p} className={t.prose}>{p}</p>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Pricing</div>
          <h2 className={s.sectionTitle}>What affects the price</h2>
          <ul className={t.prose}>
            {page.priceFactors.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {prices.length > 0 && (
            <p className={t.prose}>
              <strong>Booked through us:</strong> {prices.map(formatGBP).join(', ')}. Real jobs and
              what they came to — every field is different, so treat these as what past work
              cost, not a price for yours.
            </p>
          )}
          <h2 className={s.sectionTitle}>Good to know</h2>
          <ul className={t.prose}>
            {page.goodToKnow.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      <FaqSection faqs={page.faqs} title={`${card.name}: common questions`} />

      {related.length > 0 && (
        <section className={`${s.section} ${s.sectionAlt}`}>
          <div className={s.sectionInner}>
            <div className={s.kicker}>Related work</div>
            <h2 className={s.sectionTitle}>Often booked alongside</h2>
            <ul className={t.prose}>
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href}>{r.name}</Link> — {r.blurb}
                </li>
              ))}
            </ul>
            <p className={t.prose}>
              <Link href="/services">All services</Link> ·{' '}
              <Link href="/paddock-maintenance">Paddock maintenance by county</Link>
            </p>
          </div>
        </section>
      )}
      <SiteFooter />
    </div>
  );
}
