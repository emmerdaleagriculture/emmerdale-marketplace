'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { SocialLinks } from '@/components/SocialLinks';
import s from './home.module.css';

// Root-relative, not bare fragments: this header is no longer front-page
// only, and "#services" from /contact scrolls to nothing.
const LINKS = [
  { href: '/#services', label: 'Services' },
  { href: '/notes', label: 'Notes' },
];

const CONTRACTOR_HREF = '/#operators';

/** Where every customer CTA on the front page goes: the describe-your-job flow. */
export const BOOK_HREF = '/start';

/**
 * The customer-facing navigation: sticky brand-green bar with the EA
 * monogram, section links, "Book online" and "Log in". Collapses to a
 * hamburger below 1024px. Client component only for the menu toggle and the
 * scrolled shadow; it renders identically on the server.
 *
 * Started as front-page-only, which left /contact — reached from the front
 * page's own footer — wearing a completely different header. Its section
 * links are root-relative so it works anywhere a customer might be.
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
          <Link href={CONTRACTOR_HREF} className={s.navContractor}>
            Are you a contractor?
          </Link>
        </nav>

        {/* Instagram and TikTok. Not inside navCta, which is put away below
            1024px — the icons stay up beside the burger on a phone. */}
        <SocialLinks className={s.navSocial} />

        <div className={s.navCta}>
          <Link href={BOOK_HREF} className={s.navBook}>
            Book online
          </Link>
          {/* One login for both sides. Labelling it "Contractor log in" hid it
              from the customers who now have accounts of their own. */}
          <Link href="/login" className={s.navLogin}>
            Log in
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
        <Link href={CONTRACTOR_HREF} onClick={close}>
          Are you a contractor?
        </Link>
        <Link href={BOOK_HREF} className={s.mobileMenuBook} onClick={close}>
          Book online
        </Link>
        <Link href="/login" onClick={close}>
          Log in
        </Link>
      </div>
    </header>
  );
}
