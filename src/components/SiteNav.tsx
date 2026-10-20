'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteHeader.module.css';
import { SocialLinks } from './SocialLinks';
import { isContractor as contractorOf, isCustomer as customerOf, useViewer, type Membership, type Viewer } from './useViewer';

/**
 * The header's links, behind a burger at every width.
 *
 * The bar itself carries the brand, the social icons, the burger, and — on
 * desktop — one link: membership. "Upgrade now" is the thing we most want a
 * free-plan contractor to see, so it stays out on the bar in yellow rather
 * than a tap away inside the menu. Below 820px there is no room for it, and
 * it joins the menu as the yellow card.
 *
 * The links depend on who is signed in, not just whether someone is:
 * contractors get their work (dashboard, jobs to price, won jobs), customers
 * get their jobs and a way to book another — a customer shown "Won jobs" is
 * looking at somebody else's business. Someone who is both gets both.
 *
 * Auth still resolves in the browser (useViewer), so pages carrying this
 * header stay statically cacheable: the logged-out links render first and swap
 * on hydration, and a visitor with no session cookie loads nothing.
 *
 * The menu is one element: a full-width sheet under the bar on a phone, a
 * popover hanging off the burger on desktop. Sections with a label, an icon on
 * every row, and the membership row set apart as the one thing on the list
 * that is an offer rather than a page.
 */

/**
 * Longest matching href wins, the same rule the admin bar uses: on /jobs/new,
 * "Open jobs" is the row that lights up rather than nothing at all. Fragment
 * links are never marked — "/#how-it-works" is a position on a page, not a
 * page you can be on.
 */
function isActive(href: string, pathname: string): boolean {
  if (href.includes('#')) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type IconName =
  | 'how'
  | 'paddock'
  | 'notes'
  | 'login'
  | 'dashboard'
  | 'price'
  | 'board'
  | 'won'
  | 'star'
  | 'myjobs'
  | 'quote'
  | 'account';

type Item = {
  href: string;
  label: string;
  icon: IconName;
  /** Menu only: a second, quieter line under the label. */
  hint?: string;
  /** The yellow card in the menu, the yellow words in the bar. */
  upgrade?: boolean;
  /** The current tier, shown as a small tag on the membership row. */
  tag?: string;
};

type Group = {
  label?: string;
  items: Item[];
  /** The membership group: in the menu on a phone, out on the bar on desktop. */
  membership?: boolean;
};

const ICON_PATHS: Record<IconName, ReactNode> = {
  how: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </>
  ),
  paddock: (
    <>
      <path d="M4 20c0-7 4-12 12-14-1 8-5 12-12 14Z" />
      <path d="M4 20c3-4 6-7 9-9" />
    </>
  ),
  notes: (
    <>
      <path d="M5 4h9l5 5v11H5z" />
      <path d="M14 4v5h5" />
      <path d="M8 13h8M8 17h8" />
    </>
  ),
  login: (
    <>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M12 4h7v16h-7" />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  price: (
    <>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" />
      <path d="M8 8h.01" />
    </>
  ),
  board: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 5V3M15 5V3" />
    </>
  ),
  won: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5-5" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" />,
  myjobs: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  quote: (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={styles.menuIcon}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function membershipItem(membership: Membership): Item {
  if (membership === 'open') {
    return { href: '/account/membership', label: 'Open membership', icon: 'star', hint: 'Your plan', tag: 'Open' };
  }
  if (membership === 'premium') {
    return { href: '/account/membership', label: 'Premium membership', icon: 'star', hint: 'Your plan', tag: 'Premium' };
  }
  return {
    href: '/account/membership',
    label: 'Upgrade now',
    icon: 'star',
    hint: 'First refusal on new jobs and 5% commission, from £20 a month',
    upgrade: true,
  };
}

const EXPLORE: Item[] = [
  { href: '/paddock-maintenance', label: 'Paddock maintenance', icon: 'paddock' },
  { href: '/notes', label: 'Notes', icon: 'notes' },
];

const SIGNED_OUT: Group[] = [
  {
    items: [{ href: '/#how-it-works', label: 'How it works', icon: 'how' }, ...EXPLORE],
  },
  { items: [{ href: '/login', label: 'Log in', icon: 'login' }] },
];

/** A header link that knows whether you are already there. */
function NavLink({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const active = isActive(href, pathname);
  const cls = [className, active ? styles.on : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <Link href={href} onClick={onClick} className={cls} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}

export function SiteNav({ viewer: known, defaultOpen = false }: { viewer?: Viewer; defaultOpen?: boolean } = {}) {
  const viewer = useViewer(known);
  const [open, setOpen] = useState(defaultOpen);
  const pathname = usePathname();

  // A menu left open across a navigation covers the page you asked for.
  useEffect(() => setOpen(false), [pathname]);

  // A click anywhere else, or Escape, puts the menu away. The ref wraps the
  // burger and the panel together so a click on either is "inside". It is a
  // click, not a pointerdown: on a phone the sheet is taller than the screen,
  // and the touch that starts a scroll must not close it. Escape hands focus
  // back to the burger, so a keyboard user's next Tab carries on from there
  // rather than from the top of the page.
  const anchor = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (anchor.current && !anchor.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const role = viewer.signedIn ? viewer.role : null;
  const isContractor = contractorOf(viewer);
  const isCustomer = customerOf(viewer);

  let groups: Group[];
  if (!viewer.signedIn) {
    groups = SIGNED_OUT;
  } else {
    groups = [];
    if (isContractor) {
      groups.push({
        label: 'Your work',
        items: [
          { href: '/account', label: 'Dashboard', icon: 'dashboard' },
          { href: '/invitations', label: 'Jobs to price', icon: 'price' },
          // The open board. It was reachable only from inside the dashboard,
          // so the one page where a contractor goes looking for work had no
          // route to it from the header. /jobs/new hangs off it.
          { href: '/jobs', label: 'Open jobs', icon: 'board' },
          { href: '/won', label: 'Won jobs', icon: 'won' },
        ],
      });
      // Where they stand with us, and the way up if they are on the free
      // plan. Its own page: join, change tier, billing.
      groups.push({ label: 'Membership', items: [membershipItem(viewer.membership)], membership: true });
    }
    const customerItems: Item[] = [];
    if (isCustomer) customerItems.push({ href: '/my', label: 'My jobs', icon: 'myjobs' });
    if (role === 'customer') customerItems.push({ href: '/start', label: 'Get a quote', icon: 'quote' });
    // Signed in with neither profile: an admin, or a contractor part-way
    // through signing up — /account routes both to the right place.
    if (role === 'account') customerItems.push({ href: '/account', label: 'Account', icon: 'account' });
    if (customerItems.length) groups.push({ label: isContractor ? 'Your jobs' : undefined, items: customerItems });
    groups.push({ label: 'Explore', items: EXPLORE });
  }

  const logOut = (
    <form action="/auth/signout" method="post">
      <button type="submit" className={styles.linkButton}>Log out</button>
    </form>
  );

  // The bar's one link (desktop only): the offer. For a contractor, where
  // they stand with us and the way up; for a visitor, the way in — a laptop
  // arriving from an ad must not find a bar with nothing to click.
  const membership = groups.find((g) => g.membership)?.items[0];
  const bar = !viewer.signedIn ? (
    <Link href="/signup" className={styles.upgradeLink}>Join the network</Link>
  ) : (
    membership && (
      <NavLink
        href={membership.href}
        className={membership.upgrade ? styles.upgradeLink : styles.planLink}
      >
        <span aria-hidden="true">★ </span>
        {membership.label}
      </NavLink>
    )
  );

  // The menu: the same links with room to breathe.
  const menu = (
    <>
      {groups.map((g, i) => (
        <div
          key={g.label ?? i}
          className={g.membership ? `${styles.menuGroup} ${styles.menuMembership}` : styles.menuGroup}
        >
          {g.label && <div className={styles.menuLabel}>{g.label}</div>}
          {g.items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              onClick={close}
              className={item.upgrade ? styles.menuUpgrade : styles.menuRow}
            >
              <Icon name={item.icon} />
              <span className={styles.menuText}>
                <span className={styles.menuTitle}>
                  {item.label}
                  {item.tag && <span className={styles.menuTag}>{item.tag}</span>}
                </span>
                {item.hint && <span className={styles.menuHint}>{item.hint}</span>}
              </span>
              <svg
                className={styles.menuChevron}
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </NavLink>
          ))}
        </div>
      ))}
      {/* Join sits on the bar at desktop widths, so the foot only repeats it
          on a phone, where the bar is put away. */}
      <div className={viewer.signedIn ? styles.menuFoot : `${styles.menuFoot} ${styles.menuJoin}`}>
        {!viewer.signedIn ? (
          <Link href="/signup" className={styles.cta} onClick={close}>Join the network</Link>
        ) : (
          logOut
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Nothing for a customer or an admin: an empty landmark is noise. */}
      {bar && <nav className={styles.bar} aria-label="Membership">{bar}</nav>}

      {/* Instagram and TikTok, beside the burger at every width. */}
      <SocialLinks className={styles.social} />

      <div className={styles.menuAnchor} ref={anchor}>
        <button
          ref={toggle}
          type="button"
          className={styles.navToggle}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L16 16" />
              <path d="M16 4 L4 16" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <nav id="site-menu" className={styles.menu} aria-label="Primary" hidden={!open}>
          {menu}
        </nav>
      </div>
    </>
  );
}
