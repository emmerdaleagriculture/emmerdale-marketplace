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

const TRUST = ['Prices upfront', 'Vetted contractors', 'Every job insured', 'Pay online'];

const AFTER_STEPS: [string, string][] = [
  ['You tell us what needs doing', 'In your own words. Takes about a minute — no account needed.'],
  [
    'We ask contractors who cover your area',
    'Approved operators we’ve vetted, with the work covered by our own insurance. They price your job directly — your contact details stay with us until you accept a price.',
  ],
  [
    'You see their prices side by side',
    'With how far away they are. Message any contractor who’s priced with a question before you accept, then pick the one you want.',
  ],
  [
    'You book the one you choose',
    'Pay securely online — a 15% deposit to book, and the rest once the work is done.',
  ],
  [
    'The work gets done',
    'Before and after photos land on your job page. You confirm you’re happy.',
  ],
];

export default function StartPage() {
  return (
    <div className={`${a.wrap} ${s.page}`}>
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
          <h1 className={`${a.title} ${s.title}`}>Tell us what needs doing</h1>
          <p className={`${a.sub} ${s.sub}`}>
            In your own words. We&rsquo;ll get prices from several vetted
            contractors near you — side by side, so you can compare.
          </p>
          {/* The homepage's trust chips, for an arrival who never saw the
              homepage. Two short lines on a phone; the form field's own hint
              was dropped to pay for them. */}
          <ul className={s.chips}>
            {TRUST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <LandingFlow />
          <svg
            className={s.wave}
            viewBox="0 0 400 48"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 24 C 90 6, 170 6, 250 18 S 360 30, 400 10 L400 48 L0 48Z" fill="#bfd6ad" />
            <path d="M0 36 C 110 22, 200 26, 280 34 S 370 36, 400 26 L400 48 L0 48Z" fill="#8fbb72" />
          </svg>
          {/* What happens next, for the arrival who scrolls past the box
              instead of typing in it. Strictly below the form: everything
              above the card is paid for in fold pixels on a phone, and this
              is read by someone already deciding, not someone arriving. */}
          <section className={s.after} aria-labelledby="after-title">
            <h2 id="after-title" className={s.afterTitle}>
              What happens after you send this
            </h2>
            <p className={s.afterSub}>
              No phone calls out of the blue, and nothing to pay to find out the price.
            </p>
            <ol className={s.steps}>
              {AFTER_STEPS.map(([title, body]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </li>
              ))}
            </ol>
            <p className={s.notLeadGen}>
              <strong>We&rsquo;re not a lead-generation site.</strong> Your number
              doesn&rsquo;t get passed round a list of contractors. You deal with
              us, and you choose who does the work.
            </p>
          </section>
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
