import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import type { BooksAccess } from '@/lib/books/server';
import a from '../../auth.module.css';
import m from '../market/market.module.css';
import s from './books.module.css';
import { Icon, type BooksIconName } from './BooksUi';

/** The four places people go most, as one bar. */
const PRIMARY = [
  { key: 'home', href: '/account/books', label: 'Overview' },
  { key: 'receipts', href: '/account/books/receipts', label: 'Receipts' },
  { key: 'invoices', href: '/account/books/invoices', label: 'Invoices' },
  { key: 'bank', href: '/account/books/bank', label: 'Bank' },
] as const;

/** Reports and settings, as a row of icon shortcuts. */
const SHORTCUTS: { key: string; href: string; label: string; icon: BooksIconName }[] = [
  { key: 'ledger', href: '/account/books/ledger', label: 'Trial balance', icon: 'ledger' },
  { key: 'pnl', href: '/account/books/pnl', label: 'Profit & loss', icon: 'pnl' },
  { key: 'vat', href: '/account/books/vat', label: 'VAT', icon: 'vat' },
  { key: 'tax', href: '/account/books/tax', label: 'Tax pointers', icon: 'tax' },
  { key: 'journal', href: '/account/books/journal', label: 'Journal', icon: 'journal' },
  { key: 'settings', href: '/account/books/settings', label: 'Settings', icon: 'settings' },
];

export type BooksTab = (typeof PRIMARY)[number]['key'] | 'ledger' | 'pnl' | 'vat' | 'tax' | 'journal' | 'settings' | null;

/**
 * The page shell for every Books page: a short sunset-field header with the
 * business name and page title, one primary bar (Overview, Receipts,
 * Invoices, Bank), a row of icon shortcuts to the reports and settings, and
 * the read-only notice. Colours come from the site tokens, so the app's dark
 * mode and the website's light pages both follow; the header stays dark.
 */
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
  const name = access.ledger?.trading_name || access.ledger?.legal_name || access.businessName;
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={`${a.main} ${s.booksMain}`}>
        <div className={a.wide}>
          <Breadcrumb tone="light" jsonLd={false} skipHome items={items} />
          <header className={s.hero}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a 2KB mark, no need for the optimiser */}
            <img className={s.heroMark} src="/images/brand/ea-mark-white.png" alt="" width={52} height={25} />
            <div className={s.heroName}>{name}</div>
            <h1 className={s.heroTitle}>{title}</h1>
          </header>
          {access.ledger && (
            <>
              <nav className={s.primary} aria-label="Books">
                {PRIMARY.map((t) => (
                  <Link key={t.key} href={t.href} aria-current={tab === t.key ? 'page' : undefined}>
                    {t.label}
                  </Link>
                ))}
              </nav>
              <nav className={s.shortcuts} aria-label="Reports and settings">
                {SHORTCUTS.filter((t) => t.key !== 'settings' || access.canEdit).map((t) => (
                  <Link key={t.key} href={t.href} aria-current={tab === t.key ? 'page' : undefined}>
                    <Icon name={t.icon} size={24} />
                    <span>{t.label}</span>
                  </Link>
                ))}
              </nav>
            </>
          )}
          {access.ledger && !access.canEdit && (
            <p className={s.readOnly}>
              Your books are read-only while you’re not on Premium. Everything is still here and you can
              download it from the trial balance page.{' '}
              {!access.app && <Link href="/account/membership">See membership →</Link>}
            </p>
          )}
          {children}
          <p className={m.back} data-app-hide>
            <Link href="/account">← Back to your dashboard</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
