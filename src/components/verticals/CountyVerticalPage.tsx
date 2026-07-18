import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { EnquiryForm } from '@/components/enquiry/EnquiryForm';
import { COMPANY_LEGAL_NAME } from '@/lib/site';
import { VERTICALS, type VerticalKey, type CountyRef } from '@/lib/verticals';
import a from '@/app/(frontend)/auth.module.css';
import s from '@/app/(frontend)/landing.module.css';

/**
 * Shared renderer for a per-county vertical landing page, e.g.
 * /hay-bales/hampshire or /tractor-hire/surrey. Copy + schema come from the
 * vertical config, keyed on the county name.
 */
export function CountyVerticalPage({
  vertical,
  county,
  siblings,
}: {
  vertical: VerticalKey;
  county: CountyRef;
  siblings: CountyRef[];
}) {
  const v = VERTICALS[vertical];
  const name = county.name;
  const faqs = v.faqs(name);

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: v.serviceName,
    serviceType: v.serviceType,
    description: v.serviceDescription(name),
    areaServed: { '@type': 'AdministrativeArea', name },
    provider: {
      '@type': 'Organization',
      name: 'Emmerdale Agriculture',
      legalName: COMPANY_LEGAL_NAME,
      url: 'https://emmerdaleagriculture.com',
    },
  };
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <p className={a.altLink} style={{ marginBottom: 8 }}>
            <Link href={`/${vertical}`}>← {v.eyebrow}</Link>
          </p>
          <div className={a.eyebrow}>{v.eyebrow} · {name}</div>
          <h1 className={a.title}>
            {v.h1Main(name)} <em>{v.h1Em}</em>
          </h1>
          <p className={a.sub}>{v.intro(name)}</p>

          <div className={a.groupTitle}>Send an enquiry</div>
          <EnquiryForm
            category={v.category}
            detailsLabel={v.detailsLabel}
            detailsPlaceholder={v.detailsPlaceholder}
            submitLabel={v.submitLabel}
          />
        </div>
      </main>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Common questions</div>
          <h2 className={s.sectionTitle}>
            {name}, <em>answered.</em>
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

      {siblings.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionInner}>
            <div className={s.kicker}>Nearby areas</div>
            <h2 className={s.sectionTitle}>
              Also covering the <em>rest of the region.</em>
            </h2>
            <div className={s.sectionInner} style={{ maxWidth: 760, display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
              {siblings.map((c) => (
                <Link key={c.slug} href={`/${vertical}/${c.slug}`}>
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
