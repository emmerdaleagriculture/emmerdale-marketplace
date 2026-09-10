import type { Metadata } from 'next';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import { LandingFlow } from './LandingFlow';
import a from '../auth.module.css';
import s from './start.module.css';

/**
 * Paid-ads landing page. One job: convert a paid click into a complete,
 * normalised job record (spec Part 1). Deliberately noindexed, disallowed in
 * robots.txt and absent from the sitemap — this page exists for ad traffic
 * only.
 *
 * It reads no searchParams so it stays statically renderable: the step-1 form
 * markup ships in the initial HTML (spec §3). UTM/gclid attribution is read
 * client-side at submit time instead.
 */
export const metadata: Metadata = {
  title: 'Tell us about your job',
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return (
    <div className={a.wrap}>
      {/* Turnstile's challenge round-trip is the last thing between the
          customer and a working submit — start its connection immediately.
          React hoists these into <head>. */}
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <HomeHeader />
      {/* Everything above the form is a cost paid by every arrival: with the
          old 56px top padding and a four-line standfirst, the description box
          began 687px down a 664px phone viewport — below the fold on the
          device three quarters of the ad traffic uses. Both are trimmed to
          buy those pixels back. */}
      <main className={`${a.main} ${s.main}`}>
        <div className={a.narrow}>
          {/* No eyebrow here, unlike the rest of the site: "FIELD & PADDOCK
              WORK" in letterspaced caps says what the h1 and the standfirst
              below it already say in plain words, and the header names the
              business. On the one page bought by the click it was 30px
              charged to every arrival for a second telling. */}
          <h1 className={a.title}>Tell us what needs doing</h1>
          <p className={`${a.sub} ${s.sub}`}>
            In your own words — we&rsquo;ll pass it to contractors who cover
            your area.
          </p>
          <LandingFlow />
          {/* Outside <LandingFlow> on purpose: it renders one of three things
              depending on where the customer is, and the way to reach a human
              should not depend on which. */}
          <p className={s.contact}>
            If you need to contact us directly, email{' '}
            <a href="mailto:tom@emmerdaleagriculture.com">tom@emmerdaleagriculture.com</a>.
          </p>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
