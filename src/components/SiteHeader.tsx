import Link from 'next/link';
import styles from './SiteHeader.module.css';
import { HeaderAuthNav } from './HeaderAuthNav';

/**
 * Top navigation. Static-safe: no server-side auth read (that would force every
 * page dynamic and kill CDN caching). Auth-dependent links resolve client-side
 * in HeaderAuthNav. `variant="overlay"` sits transparently over a dark hero;
 * "solid" is the default green bar for interior pages.
 */
export function SiteHeader({ variant = 'solid' }: { variant?: 'overlay' | 'solid' }) {
  return (
    <header className={`${styles.header} ${variant === 'overlay' ? styles.overlay : styles.solid}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Emmerdale Agriculture
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link href="/#how-it-works">How it works</Link>
          <HeaderAuthNav />
        </nav>
      </div>
    </header>
  );
}
