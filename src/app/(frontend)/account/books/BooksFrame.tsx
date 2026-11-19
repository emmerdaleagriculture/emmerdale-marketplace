import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import type { BooksAccess } from '@/lib/books/server';
import a from '../../auth.module.css';
import m from '../market/market.module.css';
import s from './books.module.css';

const TABS = [
  { key: 'home', href: '/account/books', label: 'Overview' },
  { key: 'receipts', href: '/account/books/receipts', label: 'Receipts' },
  { key: 'ledger', href: '/account/books/ledger', label: 'Trial balance' },
  { key: 'pnl', href: '/account/books/pnl', label: 'Profit & loss' },
  { key: 'journal', href: '/account/books/journal', label: 'Journal' },
  { key: 'settings', href: '/account/books/settings', label: 'Settings' },
] as const;

export type BooksTab = (typeof TABS)[number]['key'] | null;

/** The page shell for every Books page: header, breadcrumb, title, tabs, read-only notice. */
export function BooksFrame({
  access,
  title,
  tab,
  crumb,
  children,
}: {
  access: BooksAccess;
  title: string;
  tab: BooksTab;
  crumb?: string;
  children: ReactNode;
}) {
  const items = [{ label: 'Dashboard', href: '/account' }, ...(crumb ? [{ label: 'Books', href: '/account/books' }, { label: crumb }] : [{ label: 'Books' }])];
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb tone="light" jsonLd={false} skipHome items={items} />
          <div className={a.eyebrow}>{access.ledger?.trading_name || access.ledger?.legal_name || access.businessName}</div>
          <h1 className={a.title}>{title}</h1>
          {access.ledger && (
            <nav className={s.nav} aria-label="Books">
              {TABS.filter((t) => t.key !== 'settings' || access.canEdit).map((t) => (
                <Link key={t.key} href={t.href} aria-current={tab === t.key ? 'page' : undefined}>
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
          {access.ledger && !access.canEdit && (
            <p className={s.readOnly}>
              Your books are read-only while you’re not on Premium. Everything is still here and you can
              download it from the trial balance page.{' '}
              {!access.app && <Link href="/account/membership">See membership →</Link>}
            </p>
          )}
          {children}
          <p className={m.back}>
            <Link href="/account">← Back to your dashboard</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
