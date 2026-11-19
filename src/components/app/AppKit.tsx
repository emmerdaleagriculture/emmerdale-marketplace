import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import k from './appKit.module.css';

/**
 * The app's shared screen pieces (2026-11-19), first drawn for Books and now
 * on every contractor tab: a photo header, figure tiles coloured by what the
 * figure is, line icons and a row of icon shortcuts. Colours come from the
 * site tokens, so light and dark app mode both follow; the header stays dark.
 */

/** One photo per tab, so each screen is known at a glance. */
const PHOTOS = {
  books: { src: '/images/app/books.jpg', at: 'center 14%' },
  dashboard: { src: '/images/app/dashboard.jpg', at: 'center 45%' },
  jobs: { src: '/images/app/jobs.jpg', at: 'center 45%' },
  earnings: { src: '/images/app/earnings.jpg', at: 'center 45%' },
  diary: { src: '/images/app/diary.jpg', at: 'center 45%' },
  messages: { src: '/images/app/messages.jpg', at: 'center 45%' },
} as const;

export type HeroPhoto = keyof typeof PHOTOS;

/**
 * The header: the Emmerdale mark, a small line (business name, a greeting)
 * and the screen's title over the tab's photo. Full width in the app, a
 * rounded card on the website. `children` sits under the title (badges).
 */
export function AppHero({ photo, name, title, tall, children }: { photo: HeroPhoto; name?: ReactNode; title: ReactNode; tall?: boolean; children?: ReactNode }) {
  const p = PHOTOS[photo];
  const style = { '--hero-photo': `url('${p.src}')`, '--hero-at': p.at } as CSSProperties;
  return (
    <header className={`${k.hero} ${tall ? k.heroTall : ''}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a 2KB mark, no need for the optimiser */}
      <img className={k.heroMark} src="/images/brand/ea-mark-white.png" alt="" width={52} height={25} />
      {name && <div className={k.heroName}>{name}</div>}
      <h1 className={k.heroTitle}>{title}</h1>
      {children}
    </header>
  );
}

/** Line icons (Lucide/Feather shapes, one path each, drawn in the current colour). */
const PATHS = {
  ledger: 'M12 3v18M7 21h10M4 7h16M12 3v4M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z',
  pnl: 'M5 20v-6M12 20V9M19 20V4M3 20h18',
  vat: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  tax: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 17l6-6M9.5 11.5h.01M14.5 16.5h.01',
  journal: 'M5 3h11a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM9 8h5M9 12h5M9 16h3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  bank: 'M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z',
  coins: 'M8 13c3.3 0 6-1.3 6-3S11.3 7 8 7s-6 1.3-6 3 2.7 3 6 3zM2 10v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M10 7.2C10.6 5.4 13.1 4 16 4c3.3 0 6 1.3 6 3s-2.4 2.9-5.5 3M22 7v4c0 1.6-2.3 2.8-5.4 3',
  expenses: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  trend: 'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  plus: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v8M8 12h8',
  minus: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  car: 'M3 17v-5l2.2-5.2A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.3L21 12v5M3 12h18M3 17h18M6 17v2M18 17v2M7 14.5h.01M17 14.5h.01',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  check: 'M20 6 9 17l-5-5',
  calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  board: 'M9 4h6v3H9zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 12h6M9 16h4',
  pound: 'M17 20H7c2-1.5 2.5-3.5 2.5-6V8.5a3.5 3.5 0 0 1 6.5-1.8M6 13h8',
  tenders: 'M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3l9 5H3z',
  star: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export type TileTone = 'teal' | 'green' | 'amber' | 'red';

/** The grid the figure tiles sit in: two across on a phone. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className={k.tiles}>{children}</div>;
}

/** A figure: its icon on a square coloured by tone, the label, the amount and a hint. A link when given `href`. */
export function Tile({ icon, label, value, hint, tone, href }: { icon: IconName; label: string; value: ReactNode; hint?: ReactNode; tone: TileTone; href?: string }) {
  const body = (
    <>
      <div className={k.tileHead}>
        <span className={k.tileIcon}>
          <Icon name={icon} size={20} />
        </span>
        <span className={k.tileLabel}>{label}</span>
      </div>
      <div className={k.tileValue}>{value}</div>
      {hint && <div className={k.tileHint}>{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} prefetch={false} className={`${k.tile} ${k.tileLink}`} data-tone={tone}>
      {body}
    </Link>
  ) : (
    <div className={k.tile} data-tone={tone}>
      {body}
    </div>
  );
}

/** A row of icon shortcuts to the screens a tab leads on to. */
export function Shortcuts({ label, items }: { label: string; items: { href: string; label: string; icon: IconName; badge?: number; current?: boolean }[] }) {
  return (
    <nav className={k.shortcuts} style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 4)}, minmax(0, 1fr))` }} aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} prefetch={false} aria-current={t.current ? 'page' : undefined}>
          <span className={k.shortcutIcon}>
            <Icon name={t.icon} size={22} />
            {!!t.badge && <span className={k.badge}>{t.badge}</span>}
          </span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The screen's two main moves: a solid green button and an outlined one. */
export function Actions({ items }: { items: { href: string; label: string; icon: IconName }[] }) {
  return (
    <div className={k.actions}>
      {items.map((a, i) => (
        <Link key={a.href} href={a.href} prefetch={false} className={i === 0 ? k.actionMain : k.actionSecond}>
          <Icon name={a.icon} size={20} />
          {a.label}
        </Link>
      ))}
    </div>
  );
}

/** One switcher bar per screen: links, the current one filled green. */
export function Seg({ label, items }: { label: string; items: { href: string; label: ReactNode; current?: boolean }[] }) {
  return (
    <nav className={k.seg} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} prefetch={false} replace scroll={false} aria-current={t.current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** A strip for what needs doing, with an arrow: tap to go there. */
export function Attention({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className={k.attention}>
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <span>{children}</span>
      <Icon name="arrow" size={18} />
    </Link>
  );
}
