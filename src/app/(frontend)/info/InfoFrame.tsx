import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb, type Crumb } from '@/components/Breadcrumb';
import { LIVE_INFO_TOPICS } from '@/lib/info/topics';
import a from '../auth.module.css';
import css from './info.module.css';

/**
 * The frame every Info page sits in: the site header and footer (both hidden
 * in the app, where the tab bar's Back slot does the job), the breadcrumb,
 * the heading, and at the foot the other Info pages.
 */
export function InfoFrame({
  slug,
  crumb,
  eyebrow,
  title,
  sub,
  children,
}: {
  /** The page's own slug, left out of the "more" links. Omit on the hub. */
  slug?: string;
  crumb?: string;
  eyebrow: string;
  title: ReactNode;
  sub: ReactNode;
  children: ReactNode;
}) {
  const items: Crumb[] = crumb ? [{ label: 'Info', href: '/info' }, { label: crumb }] : [{ label: 'Info' }];
  const more = LIVE_INFO_TOPICS.filter((t) => t.slug !== slug);
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={css.page}>
          <Breadcrumb tone="light" items={items} />
          <div className={a.eyebrow}>{eyebrow}</div>
          <h1 className={a.title}>{title}</h1>
          <p className={a.sub}>{sub}</p>
          {children}
          {slug && (
            <nav className={css.more} aria-label="More in Info">
              <Link href="/info" className={css.moreAll}>
                All of Info
              </Link>
              {more.map((t) => (
                <Link key={t.slug} href={t.href!}>
                  {t.title}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
