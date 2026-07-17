import Link from 'next/link';
import { isGscConnected, isGscOAuthConfigured } from '@/lib/gsc';
import { SubNav } from './SubNav';
import styles from './seo.module.css';

/**
 * Shared setup check for every /admin/seo/* page. Admin auth is already enforced
 * by the /admin layout; this only checks the GSC OAuth setup and returns a
 * placeholder (config/connect needed) or null when ready to render.
 */
export async function seoGuard(activePath: string): Promise<{ block: React.ReactNode | null }> {
  if (!isGscOAuthConfigured()) {
    return {
      block: (
        <main className={styles.page}>
          <SubNav active={activePath} />
          <section className={styles.notConfigured}>
            <h2>OAuth not configured</h2>
            <p>
              Set <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, and{' '}
              <code>GSC_SITE_URL</code> in the environment to enable this dashboard.
            </p>
          </section>
        </main>
      ),
    };
  }

  if (!(await isGscConnected())) {
    return {
      block: (
        <main className={styles.page}>
          <SubNav active={activePath} />
          <section className={styles.notConfigured}>
            <h2>Connect your Google account</h2>
            <p>
              Click below and grant Search Console read access. The token persists
              until revoked, so this is a one-time step.
            </p>
            <p style={{ marginTop: '1rem' }}>
              <Link href="/admin/seo/auth/connect" className={styles.connectButton}>
                Connect to Google →
              </Link>
            </p>
          </section>
        </main>
      ),
    };
  }

  return { block: null };
}
