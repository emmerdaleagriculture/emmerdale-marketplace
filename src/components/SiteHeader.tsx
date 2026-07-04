import Link from 'next/link';
import styles from './SiteHeader.module.css';
import { getUser, isAdminEmail } from '@/lib/auth';

/**
 * Top navigation. Async server component — reads the session so it can show
 * "Log in / Join" when signed out and "Account / Admin" when signed in.
 * `variant="overlay"` sits transparently over a dark hero; "solid" is the
 * default green bar for interior pages.
 */
export async function SiteHeader({ variant = 'solid' }: { variant?: 'overlay' | 'solid' }) {
  const user = await getUser();
  const admin = isAdminEmail(user?.email);

  return (
    <header className={`${styles.header} ${variant === 'overlay' ? styles.overlay : styles.solid}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Emmerdale Agriculture
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link href="/#how-it-works">How it works</Link>
          {user ? (
            <>
              {admin && (
                <Link href="/admin/jobs" className={styles.admin}>
                  Admin
                </Link>
              )}
              <Link href="/jobs">Jobs</Link>
              <Link href="/account">Account</Link>
              <form action="/auth/signout" method="post">
                <button type="submit" className={styles.linkButton}>
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className={styles.cta}>
                Join the network
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
