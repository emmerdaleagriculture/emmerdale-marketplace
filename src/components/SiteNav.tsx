'use client';

import { useEffect, useState } from 'react';
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
      <Link href="/#how-it-works" onClick={close}>How it works</Link>
      <Link href="/paddock-maintenance" onClick={close}>Paddock maintenance</Link>
      <Link href="/notes" onClick={close}>Notes</Link>
      <Link href="/login" onClick={close}>Log in</Link>
      <Link href="/signup" className={styles.cta} onClick={close}>Join the network</Link>
    </>
  ) : (
    <>
      {isContractor && (
        <>
          <Link href="/account" onClick={close}>Dashboard</Link>
          <Link href="/invitations" onClick={close}>Jobs to price</Link>
          <Link href="/won" onClick={close}>Won jobs</Link>
        </>
      )}
      {isCustomer && <Link href="/my" onClick={close}>My jobs</Link>}
      {role === 'customer' && <Link href="/start" onClick={close}>Get a quote</Link>}
      {/* Signed in with neither profile: an admin, or a contractor part-way
          through signing up — /account routes both to the right place. */}
      {role === 'account' && <Link href="/account" onClick={close}>Account</Link>}
      <Link href="/paddock-maintenance" onClick={close}>Paddock maintenance</Link>
      <Link href="/notes" onClick={close}>Notes</Link>
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
