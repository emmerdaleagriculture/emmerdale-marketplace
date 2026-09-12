import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MinimalHeader } from '@/components/MinimalHeader';
import { getUser, postLoginPath } from '@/lib/auth';
import a from '../auth.module.css';
import s from './app.module.css';

/**
 * Entry screen for the wrapped mobile app. The Capacitor shell boots
 * straight here instead of at `/` — installing the app is necessarily a
 * *second* visit (someone found the site first), so the marketing homepage
 * has nothing left to sell. This shows the two things anyone opens the app
 * to actually do.
 *
 * Copy below is quoted directly from the site's own pages, not paraphrased:
 * the /start page's own h1 and standfirst, and the site's real nav CTA
 * ("Book online") and signup page title ("Join the network").
 *
 * Signed-in visitors never see this screen: they're sent on immediately by
 * the same postLoginPath() routing /login already uses, so a contractor
 * lands on the job board and a customer lands on their jobs — identical to
 * what happens if they logged in on the website.
 *
 * Deliberately not indexed: this route exists for the app shell, not search
 * or organic web traffic, which still lands on `/` as before.
 */
export const metadata: Metadata = {
  title: 'Emmerdale Agriculture',
  robots: { index: false, follow: false },
};

export default async function AppHomePage() {
  const user = await getUser();
  if (user) redirect(await postLoginPath(user.id, user.email));

  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Emmerdale Agriculture</div>
          <h1 className={a.title}>What do you need to do?</h1>

          <div className={a.row2}>
            <Link href="/start" className={`${a.card} ${s.cardLink}`}>
              <h2 className={a.cardTitle}>Book online</h2>
              <p className={s.cardDesc}>
                In your own words &mdash; we&rsquo;ll pass it to contractors who cover your area.
              </p>
            </Link>

            <Link href="/signup" className={`${a.card} ${s.cardLink}`}>
              <h2 className={a.cardTitle}>Join the network</h2>
              <p className={s.cardDesc}>
                We bring you the customer, you set your own price. No fee &mdash; you receive 100% of what you quoted.
              </p>
            </Link>
          </div>

          <p className={a.altLink}>
            Already have an account? <Link href="/login?next=/app">Log in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

