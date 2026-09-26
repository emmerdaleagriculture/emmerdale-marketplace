import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getUser, postLoginPath } from '@/lib/auth';
import {
  HEADLINE,
  KICKER,
  NO_OBLIGATION,
  OPERATOR_CTA,
  OPERATOR_QUESTION,
  PROMISES,
  STANDFIRST,
} from '@/lib/home/proposition';
import s from './app.module.css';

/**
 * Entry screen for the wrapped mobile app. The Capacitor shell boots straight
 * here instead of at `/` — installing the app is necessarily a *second* visit
 * (someone found the site first), so the long-form homepage has nothing left
 * to sell. This keeps the homepage's proposition and puts the one thing people
 * open the app to do — get prices for a job — under a single full-width
 * button, with contractor signup as a footnote.
 *
 * All customer-facing wording comes from `@/lib/home/proposition`, the same
 * module the homepage hero renders from. An earlier version copied its lines
 * by hand and drifted ("we'll pass it to contractors", "Prices upfront")
 * after the homepage changed. Do not add hard-coded proposition copy here.
 *
 * Signed-in visitors never see this screen: postLoginPath() — the same routing
 * /login already uses — sends a contractor to their dashboard (/account) and a
 * customer to their jobs (/my), identical to logging in on the website.
 *
 * Deliberately not indexed (and disallowed in robots.ts, as /start is): this
 * route exists for the app shell, not for search. Organic traffic still lands
 * on `/`.
 */
export const metadata: Metadata = {
  title: 'Emmerdale Agriculture',
  robots: { index: false, follow: false },
};

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
          <p className={s.eyebrow}>{KICKER}</p>
          <h1 className={s.title}>{HEADLINE}</h1>
          <p className={s.sub}>
            {STANDFIRST.before}
            <strong>{STANDFIRST.emphasis}</strong>
            {STANDFIRST.after}
          </p>
        </div>
      </section>

      <main className={s.body}>
        <Link href="/start?src=app" className={s.cta}>
          Get prices <span aria-hidden="true">›</span>
        </Link>
        <p className={s.ctaSub}>{NO_OBLIGATION}</p>

        <ul className={s.promises}>
          {PROMISES.map(([title, body]) => (
            <li key={title} className={s.promise}>
              <span aria-hidden="true" className={s.tick}>
                ✓
              </span>
              <span>
                <strong>{title}</strong> {body}
              </span>
            </li>
          ))}
        </ul>

        <div className={s.spacer} />

        <div className={s.secondary}>
          <p className={s.secondaryQ}>{OPERATOR_QUESTION}</p>
          <Link href="/signup" className={s.secondaryLink}>
            {OPERATOR_CTA} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
