import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser, isAdminEmail } from '@/lib/auth';
import styles from './admin.module.css';

/**
 * Admin guard. Gated on the ADMIN_EMAILS allowlist (spec §7.1). Non-admins are
 * bounced to their account; signed-out users to login.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!isAdminEmail(user.email)) redirect('/account');

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          Emmerdale Agriculture
        </Link>
        <nav className={styles.nav}>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/jobs">Jobs</Link>
          <Link href="/admin/contractors">Contractors</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className={styles.signout}>
              Log out
            </button>
          </form>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
