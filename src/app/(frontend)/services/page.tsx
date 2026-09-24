import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { HOME_SERVICES } from '@/lib/home/services';
import { servicePagePath } from '@/lib/services';
import a from '../auth.module.css';
import s from '../landing.module.css';
import t from './services.module.css';

export const metadata: Metadata = {
  title: 'Agricultural Contracting Services',
  description:
    'Every job we price: paddock topping, harrowing, hedge cutting, fencing, forestry, tracks and more. What each involves, when to do it and what moves the price.',
  alternates: { canonical: '/services' },
};

/**
 * The index of every service page — the crawlable way in to them, and the
 * page the header's "Services" link now points at.
 */
export default function ServicesIndex() {
  const items = HOME_SERVICES.map((c) => ({ ...c, href: servicePagePath(c.slug) })).filter(
    (c): c is typeof c & { href: string } => c.href !== null,
  );
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb tone="light" items={[{ label: 'Services' }]} />
          <div className={a.eyebrow}>Everything we price</div>
          <h1 className={a.title}>
            Agricultural contracting services — <em>what each job involves.</em>
          </h1>
          <p className={a.sub}>
            From topping a pony paddock to grading a farm track. Pick a job to see what&rsquo;s
            involved, when it&rsquo;s best done and what affects the price — then get prices
            from contractors covering your area.
          </p>
        </div>
      </main>
      <section className={s.section}>
        <div className={s.sectionInner}>
          <ul className={t.prose}>
            {items.map((c) => (
              <li key={c.slug}>
                <Link href={c.href}>{c.name}</Link> — {c.blurb}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
