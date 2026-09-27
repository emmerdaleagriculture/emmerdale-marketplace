import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { TrackedLink } from '@/components/home/Track';
import { PageTracker } from '@/components/PageTracker';
import { CredSection, FaqSection } from '@/components/paddock/PaddockSections';
import { HPM_URL } from '@/lib/site';
import a from '../auth.module.css';
import s from '../landing.module.css';
import f from '@/components/forms/forms.module.css';
import c from '../agriculturalcontractors/contractors.module.css';

/**
 * Recruitment page for contractors who look after paddocks and small sites —
 * the one-tractor and compact-kit operators who top, harrow, sweep and spray
 * a few acres at a time. Run from its own ad campaign.
 *
 * /agriculturalcontractors is the general, indexable pitch. This one is for
 * paid traffic only (noindexed, disallowed in robots.txt), and says what that
 * page doesn't: most of the work coming in is small, and small is exactly
 * what these operators are set up for.
 *
 * Sign-up links carry ?from=paddock-care, and /signup records it with the
 * ad tags in contractors.signup_source, so the campaign is judged by who
 * signs up. Clicks and scroll depth are on /admin/reporting/journey.
 *
 * Copy follows /terms §2 and §4 and the insurance wording on
 * /agriculturalcontractors — the cover is ours, and we do not check
 * certificates. Change them together.
 */
export const metadata: Metadata = {
  title: 'Paddock and small-site work for contractors',
  robots: { index: false, follow: false },
};

const SIGNUP = '/signup?from=paddock-care';

const REASONS: { h: string; body: string }[] = [
  {
    h: 'Most of our jobs are small ones',
    body: 'Most of the work that comes in is under ten acres, and a typical job is a couple of acres: a horse paddock to top, harrow or sweep, ragwort to deal with, a bit of rolling after winter. Work for a compact tractor and a topper, not a combine.',
  },
  {
    h: 'Only jobs near your base',
    body: 'You’re sent work in the counties you cover and within 40 miles of your yard. Nothing you’d have to drive past three other contractors to reach, and anything that isn’t for you is one tap to pass.',
  },
  {
    h: 'Enough to price without a visit',
    body: 'On a small site the access is the job. Every job comes with the acreage — often drawn on a map by the customer — the postcode district, gate width, access notes and photos, so you can price it from the yard.',
  },
  {
    h: 'Your price, minimum charge and all',
    body: 'Put your travel and your minimum charge into the price you give. The customer sees the whole figure before they book, so a small job is never a surprise to either of you.',
  },
  {
    h: 'No chasing for money',
    body: 'The customer pays a deposit to book, so nobody’s wasting your morning, and the balance once the work’s done. You send us one invoice and we pay it.',
  },
  {
    h: 'Free, and nothing off your invoice',
    body: 'No joining fee, no monthly fee, no commission. Our margin sits on top of your price and the customer pays it.',
  },
];

const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: 'A paddock job comes in near you',
    body: 'A customer tells us what needs doing. We check it over and email it to the contractors covering that ground.',
  },
  {
    n: 2,
    title: 'You price it, or you pass',
    body: 'One tap either way, from the email. No obligation and no cost to price, and passing doesn’t count against you.',
  },
  {
    n: 3,
    title: 'You do the work, we pay you',
    body: 'If they take your price they pay a deposit and you get their details. Do the job, mark it complete, send us your invoice.',
  },
];

// Answers kept word-for-word with /agriculturalcontractors where they
// overlap: these are commercial terms, and two versions would drift.
const faqs = [
  {
    q: 'What does it cost to join?',
    a: 'Nothing. Registration is free, quoting is free, there is no monthly fee, and nothing is deducted from your invoice. You keep the price you quote — our margin is added on top and paid by the customer.',
  },
  {
    q: 'Is it worth it for jobs this small?',
    a: 'That is your call, job by job. You set the price, so build in your travel and your minimum charge, and pass on anything that doesn’t suit your diary. Passing costs nothing.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'The customer pays a deposit to book the job, and the balance falls due once the work is done and they have confirmed it — or automatically three working days after you mark it complete, if they neither confirm nor raise a problem. You are paid your full quoted price once that balance has cleared and we have your invoice. You never invoice the customer yourself.',
  },
  {
    q: 'Do I need my own insurance and certificates?',
    a: 'Work done through us is covered by our own public liability policy, so you do not need to hold cover of your own to take jobs from us. We do not ask to see spraying, chainsaw or machinery certificates either — what you are qualified and ticketed to operate is your responsibility as an independent business, not something we sit in judgement on.',
  },
  {
    q: 'Is there a check before I start getting work?',
    a: 'Yes, though it is a light one. Registration is free and subject to approval: we check who you are and that you are a working contracting business, and we speak to you before any job reaches you.',
  },
  {
    q: 'How much work will I get?',
    a: 'It depends on your county and the time of year — topping in high summer and hedge cutting after the nesting season are the busy stretches. We would rather tell you straight than promise a number we cannot stand behind.',
  },
];

export default function PaddockCarePage() {
  return (
    <div className={a.wrap}>
      <PageTracker path="/paddock-care" />
      <SiteHeader />

      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>For paddock contractors</div>
          <h1 className={`${a.title} ${c.heroTitle}`}>
            Small paddock jobs, <em>sent to you.</em>
          </h1>
          <p className={`${a.sub} ${c.heroSub}`}>
            Horse owners and smallholders tell us what their paddocks need. We send you the
            jobs near your yard, and you price the ones that suit your kit.
          </p>

          <ul className={c.trust}>
            {['Free to join', 'You set the price', 'Jobs within 40 miles', 'Paid on your invoice'].map(
              (t) => (
                <li key={t} className={c.trustItem}>
                  {t}
                </li>
              ),
            )}
          </ul>

          <div className={c.heroCta}>
            <TrackedLink
              href={SIGNUP}
              event="operator_apply"
              params={{ location: 'paddock_care_hero' }}
              className={f.btnPrimary}
            >
              Join free →
            </TrackedLink>
            <p className={c.heroMeta}>
              Two minutes to register. No monthly fee. Nothing comes off your invoice.
            </p>
          </div>
        </div>
      </main>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Built for small sites</div>
          <h2 className={s.sectionTitle}>
            The work that suits <em>a compact outfit.</em>
          </h2>
          <div className={c.reasons}>
            {REASONS.map((r) => (
              <div key={r.h} className={c.reason}>
                <h3 className={c.reasonH}>{r.h}</h3>
                <p className={c.reasonBody}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.sectionTitle}>
            From your inbox <em>to your bank.</em>
          </h2>
          <div className={s.steps}>
            {STEPS.map((step) => (
              <div key={step.n} className={s.step}>
                <div className={s.stepNum}>{step.n}</div>
                <div className={s.stepTitle}>{step.title}</div>
                <p className={s.stepBody}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CredSection>
        Emmerdale Agriculture is run by the people behind{' '}
        <a href={HPM_URL}>Hampshire Paddock Management</a> — a contracting firm that tops,
        harrows, rolls and sprays paddocks for a living. We know what a small job is worth,
        and what a wasted trip to look at one costs.
      </CredSection>

      <FaqSection
        faqs={faqs}
        title={
          <>
            The questions <em>worth asking first.</em>
          </>
        }
      >
        <p className={s.sectionLede} style={{ marginTop: 32 }}>
          The full commercial terms are on the <Link href="/terms">contractor terms</Link>{' '}
          page. If something isn&rsquo;t answered there, <Link href="/contact">ask us</Link>.
        </p>
      </FaqSection>

      <section className={c.closing}>
        <div className={c.closingInner}>
          <h2 className={c.closingTitle}>
            Put your kit in front of <em>the paddocks that need it.</em>
          </h2>
          <p className={c.closingBody}>
            Two minutes to register, then a few questions about your business and the
            counties you cover. We review every application and email you when you&rsquo;re
            approved.
          </p>
          <TrackedLink
            href={SIGNUP}
            event="operator_apply"
            params={{ location: 'paddock_care_footer' }}
            className={f.btnPrimary}
          >
            Join free →
          </TrackedLink>
          <p className={c.closingMeta}>
            Already registered? <Link href="/login">Sign in</Link>.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
