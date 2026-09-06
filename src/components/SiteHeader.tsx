import Link from 'next/link';
import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';

/**
 * Top navigation. Static-safe: no server-side auth read (that would force every
 * page dynamic and kill CDN caching). Auth-dependent links resolve client-side
 * in SiteNav, which also owns the mobile menu. `variant="overlay"` sits
 * transparently over a dark hero; "solid" is the default green bar for
 * interior pages.
 */
export function SiteHeader({ variant = 'solid' }: { variant?: 'overlay' | 'solid' }) {
  return (
    <header className={`${styles.header} ${variant === 'overlay' ? styles.overlay : styles.solid}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Emmerdale Agriculture
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
