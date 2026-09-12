import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getUser, postLoginPath } from '@/lib/auth';
import s from './app.module.css';

/**
 * Entry screen for the wrapped mobile app. The Capacitor shell boots straight
 * here instead of at `/` — installing the app is necessarily a *second* visit
 * (someone found the site first), so the marketing homepage has nothing left
 * to sell. This puts the one thing people open the app to do — book a job —
 * under a single full-width button, with contractor signup as a footnote
 * rather than a competing choice.
 *
 * Every line of copy here is quoted from the live site rather than rewritten:
 * the h1 and standfirst are /start's own (the page this button leads to),
 * "Book online" is the site nav's CTA, "Free, and no obligation" and the three
 * trust chips are the homepage's, and the contractor footnote is the operators
 * section heading and its button. Nothing here is new marketing copy.
 *
 * Signed-in visitors never see this screen: postLoginPath() — the same routing
 * /login already uses — sends a contractor to the job board and a customer to
 * their jobs, identical to logging in on the website.
 *
 * Deliberately not indexed (and disallowed in robots.ts, as /start is): this
 * route exists for the app shell, not for search. Organic traffic still lands
 * on `/`.
 */
export const metadata: Metadata = {
  title: 'Emmerdale Agriculture',
  robots: { index: false, follow: false },
};

const TRUST = ['Prices upfront', 'Fully insured', 'Vetted & fully trained'];

export default async function AppHomePage() {
  const user = await getUser();
  if (user) redirect(await postLoginPath(user.id, user.email));

  return (
    <div className={s.screen}>
      <section className={s.hero}>
        <Image
          src="/john-deere-6250r.webp"
          alt="A John Deere 6250R working in a Hampshire field"
          fill
          priority
          quality={70}
          sizes="100vw"
          className={s.heroImg}
        />
        <div className={s.heroScrim} />
        <div className={s.heroTop}>
          <span className={s.brand}>Emmerdale Agriculture</span>
          <Link href="/login?next=/app" className={s.loginLink}>
            Log in
          </Link>
        </div>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>Paddock, land &amp; equestrian jobs</p>
          <h1 className={s.title}>
            Tell us what <em>needs doing</em>.
          </h1>
          <p className={s.sub}>
            In your own words &mdash; we&rsquo;ll pass it to contractors who cover your area.
          </p>
        </div>
      </section>

      <main className={s.body}>
        <Link href="/start" className={s.cta}>
          Book online <span aria-hidden="true">›</span>
        </Link>
        <p className={s.ctaSub}>Free, and no obligation</p>

        <ul className={s.trust}>
          {TRUST.map((t) => (
            <li key={t} className={s.trustItem}>
              <span aria-hidden="true" className={s.tick}>
                ✓
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <div className={s.spacer} />

        <div className={s.secondary}>
          <p className={s.secondaryQ}>Do you run an agricultural contracting business?</p>
          <Link href="/signup" className={s.secondaryLink}>
            Apply to join <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
