import type { Metadata } from 'next';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import { LandingFlow } from '../start/LandingFlow';
import { LandingAfter, TRUST } from '../start/LandingAfter';
import a from '../auth.module.css';
import s from '../start/start.module.css';
import p from './paddock-care.module.css';

/**
 * Paid-ads landing page for horse owners with a paddock or a few acres.
 *
 * The same job flow as /start, pointed at one audience: people under ten
 * acres were 29 of the first 38 jobs, and most of them keep horses. Only
 * the words around the form change — the headline, the example in the box,
 * and paddock jobs first in the list. Noindexed and disallowed in robots.txt
 * like /start: it exists for ad traffic, and /paddock-maintenance is the
 * page for search.
 *
 * Views, beacon events and jobs are recorded under /paddock-care, so
 * /admin/reporting/journey can put it beside /start.
 */
export const metadata: Metadata = {
  title: 'Paddock work for horse owners',
  robots: { index: false, follow: false },
};

// The home page's cards, in the order a horse owner reaches for them.
const PADDOCK_JOBS = [
  'topping',
  'harrowing',
  'muck-sweeping',
  'weed-control',
  'rolling',
  'overseeding',
  'fencing',
  'hedge-cutting',
] as const;

const JOBS: [string, string][] = [
  [
    'Topping',
    'Takes off seed heads and rank grass so the grazing stays leafy, and stops docks and thistles seeding.',
  ],
  [
    'Chain harrowing',
    'Spreads droppings, pulls out dead grass and levels hoof marks. Spring and autumn, when the ground isn’t too wet.',
  ],
  [
    'Muck sweeping',
    'A paddock sweeper picks up the droppings, which helps keep the worm burden down.',
  ],
  [
    'Ragwort and weeds',
    'Ragwort is poisonous to horses, fresh or dried in hay. The contractor will tell you how long to keep the horses off after spraying.',
  ],
  [
    'Rolling and overseeding',
    'Flattens winter poaching once the ground can take it, and fills the bare patches before weeds do.',
  ],
  ['Fencing', 'Post and rail, and gates, priced by the metre.'],
];

export default function PaddockCarePage() {
  return (
    <div className={`${a.wrap} ${s.page}`}>
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <HomeHeader />
      <main className={`${a.main} ${s.main}`}>
        <div className={a.narrow}>
          <h1 className={`${a.title} ${s.title}`}>Paddock work for horse owners</h1>
          <p className={`${a.sub} ${s.sub}`}>
            Tell us what your paddock needs, and we&rsquo;ll get prices from vetted
            contractors near you.
          </p>
          <ul className={s.chips}>
            {TRUST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <LandingFlow
            path="/paddock-care"
            featured={PADDOCK_JOBS}
            placeholders={{
              picked: 'e.g. two acres, horses on it, 10ft field gate off the lane',
              free: 'e.g. my two acre horse paddock needs topping, and there’s ragwort coming through',
            }}
          />
          <svg
            className={s.wave}
            viewBox="0 0 400 48"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 24 C 90 6, 170 6, 250 18 S 360 30, 400 10 L400 48 L0 48Z" fill="#bfd6ad" />
            <path d="M0 36 C 110 22, 200 26, 280 34 S 370 36, 400 26 L400 48 L0 48Z" fill="#8fbb72" />
          </svg>
          {/* Below the form, like everything else on an ad page: read by
              someone deciding, not paid for in fold pixels. */}
          <section className={s.after} aria-labelledby="jobs-title">
            <h2 id="jobs-title" className={s.afterTitle}>
              The jobs a paddock needs
            </h2>
            <p className={s.afterSub}>
              Not sure which? Describe what the paddock looks like and the contractor will say.
            </p>
            <dl className={p.jobs}>
              {JOBS.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
            {/* Small jobs are most of this audience, and a minimum charge is
                what surprises them. Said plainly rather than promising every
                half-acre will be taken on: under-2-acre jobs have drawn
                prices, but none had been booked by 27 Sep. */}
            <p className={s.notLeadGen}>
              <strong>Small paddock?</strong> Contractors include travel and any minimum
              charge in the price they give you, so you can see what a small job really
              costs before you commit to anything.
            </p>
          </section>
          <LandingAfter />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
