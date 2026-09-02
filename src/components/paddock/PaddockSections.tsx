import type { ReactNode } from 'react';
import type { ServiceOption } from '@/components/forms/ServicePicker';
import { COMPANY_REG_LINE, HPM_URL } from '@/lib/site';
import s from '@/app/(frontend)/landing.module.css';

/**
 * The sections shared by the paddock front page and every per-county page.
 * Page-specific copy stays in the pages; the repeated markup lives here.
 */

export type Faq = { q: string; a: string };

/** FAQPage schema for a visible FAQ list. Google requires both. */
export function faqSchema(faqs: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export const PADDOCK_STEPS = [
  {
    n: 1,
    title: 'Describe the job',
    body: 'In your own words — long grass, an overgrown paddock, a field that needs putting right. A photo of the field and the gateway helps, but isn’t required.',
  },
  {
    n: 2,
    title: 'We sort the details',
    body: 'We work out what the job actually needs, check the area and the access, and confirm it all back to you before it goes anywhere.',
  },
  {
    n: 3,
    title: 'Contractors get in touch',
    body: 'The job goes to contractors covering your county. Whoever’s keen contacts you directly, and you choose who does the work. Free, with no obligation to accept a quote.',
  },
];

export function ServicesSection({
  services,
  title,
  lede,
  alt = false,
}: {
  services: ServiceOption[];
  title: ReactNode;
  lede: ReactNode;
  alt?: boolean;
}) {
  return (
    <section className={alt ? `${s.section} ${s.sectionAlt}` : s.section}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>The work</div>
        <h2 className={s.sectionTitle}>{title}</h2>
        <p className={s.sectionLede}>{lede}</p>
        <div className={s.services}>
          {services.map((svc) => (
            <span key={svc.id} className={s.serviceTag}>
              {svc.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection({
  title,
  lede,
  alt = false,
}: {
  title: ReactNode;
  lede: ReactNode;
  alt?: boolean;
}) {
  return (
    <section className={alt ? `${s.section} ${s.sectionAlt}` : s.section}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>How it works</div>
        <h2 className={s.sectionTitle}>{title}</h2>
        <p className={s.sectionLede}>{lede}</p>
        <div className={s.steps}>
          {PADDOCK_STEPS.map((step) => (
            <div key={step.n} className={s.step}>
              <div className={s.stepNum}>{step.n}</div>
              <div className={s.stepTitle}>{step.title}</div>
              <p className={s.stepBody}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CredSection({ children }: { children?: ReactNode }) {
  return (
    <section className={s.cred}>
      <div className={s.credInner}>
        <h2 className={s.credTitle}>
          Run by a firm that does this work <em>every day.</em>
        </h2>
        <p className={s.credBody}>
          {children ?? (
            <>
              Emmerdale Agriculture is the network behind{' '}
              <a href={HPM_URL}>Hampshire Paddock Management</a> — a contracting
              firm that tops, harrows, rolls and sprays paddocks for a living. We
              know what a field needs from a description and a photo, which is
              why you don’t have to.
            </>
          )}
        </p>
        <p className={s.credMeta}>
          {COMPANY_REG_LINE}
        </p>
      </div>
    </section>
  );
}

export function FaqSection({
  faqs,
  title,
  alt = false,
  children,
}: {
  faqs: Faq[];
  title: ReactNode;
  alt?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={alt ? `${s.section} ${s.sectionAlt}` : s.section}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>Common questions</div>
        <h2 className={s.sectionTitle}>{title}</h2>
        <dl className={s.faq}>
          {faqs.map((f) => (
            <div key={f.q} className={s.faqItem}>
              <dt className={s.faqQ}>{f.q}</dt>
              <dd className={s.faqA}>{f.a}</dd>
            </div>
          ))}
        </dl>
        {children}
      </div>
    </section>
  );
}
