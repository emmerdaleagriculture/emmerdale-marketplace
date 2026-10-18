import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getUser } from '@/lib/auth';
import { appLandingPath, roleIntent } from '@/lib/app/landing';
import { HEADLINE, KICKER, STANDFIRST } from '@/lib/home/proposition';
import { WelcomeActions } from './WelcomeActions';
import s from './app.module.css';

/**
 * The app's welcome screen (PRD task 2). The Capacitor shell boots here.
 * A hero photo, the home page's proposition (from lib/home/proposition, the
 * one source for that wording), then the sign-in buttons: Apple and Google
 * through the native sheets, or an emailed code. "Run a contracting
 * business? Apply to join" switches the copy to the contractor's and
 * preselects that role for after sign-in.
 *
 * Signed-in visitors never see it: they go straight to their tabs
 * (lib/app/landing.ts). Not indexed, and disallowed in robots.ts: this
 * route exists for the app, not for search.
 */
export const metadata: Metadata = {
  title: 'Emmerdale Agriculture',
  robots: { index: false, follow: false },
};

export default async function AppWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const sp = await searchParams;
  const intent = roleIntent(sp.role);
  const user = await getUser();
  if (user) redirect(await appLandingPath(user.id, user.email, intent));

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

      <WelcomeActions initialIntent={intent} />
    </div>
  );
}
