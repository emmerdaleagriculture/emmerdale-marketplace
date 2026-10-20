import Link from 'next/link';
import { BrandLockup } from '@/components/home/BrandMark';
import styles from './SiteHeader.module.css';
import { SiteNav } from './SiteNav';
import type { Viewer } from './useViewer';

/**
 * Top navigation. Static-safe: no server-side auth read (that would force every
 * page dynamic and kill CDN caching). Auth-dependent links resolve client-side
 * in SiteNav, which also owns the mobile menu. `variant="overlay"` sits
 * transparently over a dark hero; "solid" is the default green bar for
 * interior pages; "landing" is solid with the landing header's geometry —
 * sticky, 68px — for the landing pages, which hand it a viewer they have
 * already resolved so it renders in the right state at once.
 */
export function SiteHeader({
  variant = 'solid',
  viewer,
  menuOpen,
}: {
  variant?: 'overlay' | 'solid' | 'landing';
  viewer?: Viewer;
  menuOpen?: boolean;
}) {
  const tone = variant === 'overlay' ? styles.overlay : variant === 'landing' ? `${styles.solid} ${styles.landing}` : styles.solid;
  return (
    <header className={`${styles.header} ${tone}`} data-app-hide>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Emmerdale Agriculture home">
          <BrandLockup width={105} className={styles.brandLockup} priority sizes="(max-width: 820px) 89px, 105px" />
        </Link>
        <SiteNav viewer={viewer} defaultOpen={menuOpen} />
      </div>
    </header>
  );
}
