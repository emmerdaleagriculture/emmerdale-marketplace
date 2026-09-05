'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './SiteHeader.module.css';

/**
 * The header's links, and the menu they collapse into.
 *
 * A signed-in contractor gets eight items — Paddock maintenance, Notes, Jobs,
 * Invitations, Won jobs, Account, Log out — in a row that did not wrap or
 * scroll. On a phone the last of them simply ran off the right edge: "Log out"
 * was unreachable, and "Won jobs" sat under the thumb of a two-line
 * "Paddock maintenance". Hiding one link at 620px was never going to be
 * enough for a list this long, so below 820px the whole thing becomes a menu.
 *
 * Auth still resolves in the browser, so pages carrying this header stay
 * statically cacheable: the logged-out links render first and swap on
 * hydration.
 */
export function SiteNav() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  // A menu left open across a navigation covers the page you asked for.
  useEffect(() => setOpen(false), [pathname]);

  const close = () => setOpen(false);

  const links = signedIn ? (
    <>
      <Link href="/paddock-maintenance" onClick={close}>Paddock maintenance</Link>
      <Link href="/notes" onClick={close}>Notes</Link>
      <Link href="/jobs" onClick={close}>Jobs</Link>
      <Link href="/invitations" onClick={close}>Invitations</Link>
      <Link href="/won" onClick={close}>Won jobs</Link>
      <Link href="/account" onClick={close}>Account</Link>
      <form action="/auth/signout" method="post">
        <button type="submit" className={styles.linkButton}>Log out</button>
      </form>
    </>
  ) : (
    <>
      <Link href="/#how-it-works" onClick={close}>How it works</Link>
      <Link href="/paddock-maintenance" onClick={close}>Paddock maintenance</Link>
      <Link href="/notes" onClick={close}>Notes</Link>
      <Link href="/login" onClick={close}>Log in</Link>
      <Link href="/signup" className={styles.cta} onClick={close}>Join the network</Link>
    </>
  );

  return (
    <>
      <nav className={styles.nav} aria-label="Primary">{links}</nav>

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
