'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import s from './home.module.css';

const LINKS = [
  { href: '#services', label: 'Services' },
  { href: '/notes', label: 'Notes' },
];

/** Where every customer CTA on the front page goes: the describe-your-job flow. */
export const BOOK_HREF = '/start';

/**
 * Front-page navigation: sticky brand-green bar with the EA monogram, section
 * links, the "Book online" outline button and the phone number. Collapses to a
 * hamburger below 1024px. Client component only for the menu toggle and the
 * scrolled shadow; it renders identically on the server.
 */
export function HomeHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the menu when the viewport grows past the mobile breakpoint.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`${s.nav} ${scrolled ? s.navScrolled : ''}`}>
      <div className={`${s.container} ${s.navInner}`}>
        <Link href="/" className={s.brand} aria-label="Emmerdale Agriculture home">
          <BrandMark className={s.brandMark} />
          <span className={s.brandWordmark}>Emmerdale Agriculture</span>
        </Link>

        <nav className={s.navLinks} aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href}>
              {l.label}
            </Link>
          ))}
          <a href="#operators" className={s.navContractor}>
            Are you a contractor?
          </a>
        </nav>

        <div className={s.navCta}>
          <Link href={BOOK_HREF} className={s.navBook}>
            Book online
          </Link>
        </div>

        <button
          type="button"
          className={s.navToggle}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="home-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L16 16" />
              <path d="M16 4 L4 16" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      <div id="home-mobile-menu" className={s.mobileMenu} hidden={!open}>
        {LINKS.map((l) => (
          <Link key={l.label} href={l.href} onClick={close}>
            {l.label}
          </Link>
        ))}
        <a href="#operators" onClick={close}>
          Are you a contractor?
        </a>
        <Link href={BOOK_HREF} className={s.mobileMenuBook} onClick={close}>
          Book online
        </Link>
        <Link href="/login" onClick={close}>
          Contractor log in
        </Link>
      </div>
    </header>
  );
}
