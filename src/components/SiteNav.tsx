'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteHeader.module.css';
import { SocialLinks } from './SocialLinks';
import { useViewer } from './useViewer';

/**
 * The header's links, and the menu they collapse into.
 *
 * A signed-in contractor's list ran off the right edge of a phone, so below
 * 820px the whole thing becomes a menu.
 *
 * The links depend on who is signed in, not just whether someone is:
 * contractors get their work (dashboard, jobs to price, won jobs), customers
 * get their jobs and a way to book another — a customer shown "Won jobs" is
 * looking at somebody else's business. Someone who is both gets both.
 *
 * Auth still resolves in the browser (useViewer), so pages carrying this
 * header stay statically cacheable: the logged-out links render first and swap
 * on hydration, and a visitor with no session cookie loads nothing.
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

/** A header link that knows whether you are already there. */
function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const active = isActive(href, pathname);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={active ? styles.on : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

export function SiteNav() {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A menu left open across a navigation covers the page you asked for.
  useEffect(() => setOpen(false), [pathname]);

  const close = () => setOpen(false);

  const logOut = (
    <form action="/auth/signout" method="post">
      <button type="submit" className={styles.linkButton}>Log out</button>
    </form>
  );

  const role = viewer.signedIn ? viewer.role : null;
  const isContractor = role === 'contractor' || role === 'both';
  const isCustomer = role === 'customer' || role === 'both';

  const links = !viewer.signedIn ? (
    <>
      <NavLink href="/#how-it-works" onClick={close}>How it works</NavLink>
      <NavLink href="/paddock-maintenance" onClick={close}>Paddock maintenance</NavLink>
      <NavLink href="/notes" onClick={close}>Notes</NavLink>
      <NavLink href="/login" onClick={close}>Log in</NavLink>
      {/* Not a NavLink: the CTA is already the loudest thing in the bar, and
          marking it "current" on /signup fights its own styling. */}
      <Link href="/signup" className={styles.cta} onClick={close}>Join the network</Link>
    </>
  ) : (
    <>
      {isContractor && (
        <>
          <NavLink href="/account" onClick={close}>Dashboard</NavLink>
          <NavLink href="/invitations" onClick={close}>Jobs to price</NavLink>
          {/* The open board. It was reachable only from inside the dashboard,
              so the one page where a contractor goes looking for work had no
              route to it from the header. /jobs/new hangs off it. */}
          <NavLink href="/jobs" onClick={close}>Open jobs</NavLink>
          <NavLink href="/won" onClick={close}>Won jobs</NavLink>
        </>
      )}
      {isCustomer && <NavLink href="/my" onClick={close}>My jobs</NavLink>}
      {role === 'customer' && <NavLink href="/start" onClick={close}>Get a quote</NavLink>}
      {/* Signed in with neither profile: an admin, or a contractor part-way
          through signing up — /account routes both to the right place. */}
      {role === 'account' && <NavLink href="/account" onClick={close}>Account</NavLink>}
      <NavLink href="/paddock-maintenance" onClick={close}>Paddock maintenance</NavLink>
      <NavLink href="/notes" onClick={close}>Notes</NavLink>
      {logOut}
    </>
  );

  return (
    <>
      <nav className={styles.nav} aria-label="Primary">{links}</nav>

      {/* Instagram and TikTok. Outside the collapsing nav on purpose: two
          icons fit beside the burger, and a phone visitor is the one most
          likely to want them. */}
      <SocialLinks className={styles.social} />

      <button
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

      <div id="site-menu" className={styles.mobileMenu} hidden={!open}>
        {links}
      </div>
    </>
  );
}
