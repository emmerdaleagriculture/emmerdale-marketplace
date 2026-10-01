import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { TrackedLink } from '@/components/home/Track';
import { FloatingJoin } from '@/components/contractors/FloatingJoin';
import { ServicesSection, CredSection, FaqSection, faqSchema } from '@/components/paddock/PaddockSections';
import { getServices, getCountyCoverage } from '@/lib/reference';
import { getOpenJobsByCounty, type CountyJobs } from '@/lib/openJobs';
import { UK_COUNTY_NAMES } from '@/lib/coverage';
import { jsonLd } from '@/lib/jsonld';
import { COMPANY_LEGAL_NAME, HPM_URL, SERVICE_AREA, siteUrl } from '@/lib/site';
import a from '../auth.module.css';
import s from '../landing.module.css';
import f from '@/components/forms/forms.module.css';
import c from './contractors.module.css';

/**
 * The supply-side front door: the page that argues the network is worth
 * joining, for contractors arriving from search or from an ad.
 *
 * Until now the only pitch to contractors was a band on the homepage
 * (`/#operators`) and the copy on /signup itself — so a contractor searching
 * for work had nowhere to land, and the homepage sells to customers first.
 * This page takes that intent and hands it to /signup, which is where the
 * account actually gets made.
 *
 * Indexable, unlike /start: the argument here is the same one whether it
 * arrives from an ad or from Google, so it earns a canonical and a sitemap
 * entry. Copy is kept in step with /terms §2 and §4 — if the commercial
 * terms change, this page changes with them.
 */

// ISR: the live data is the service taxonomy, county coverage and the jobs
// open right now — an hour stale is still "right now" for this purpose.
export const revalidate = 3600;

const SITE = siteUrl();

const TITLE = 'Work for Agricultural Contractors — Free to Join';
const DESCRIPTION =
  'We advertise, find the customers and handle the money. You price the jobs in the counties you cover and do the work. No joining fee, no monthly fee, and nothing taken off your invoice.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/agriculturalcontractors' },
  openGraph: {
    title: TITLE,
    description:
      'The jobs come to you. We pay for the advertising and handle the payment — you price the work and do it. Free to join.',
  },
};

/** The four things the network takes off a contractor's hands. */
const REASONS: { h: string; body: string[] }[] = [
  {
    h: 'The marketing is ours, and so is the bill',
    body: [
      'Finding work is its own job. Somebody has to buy the advertising, keep a website up, answer the messages and field the calls that go nowhere. We do that, and we pay for it out of our own pocket.',
      'You don’t need a website. You don’t need to be on Facebook. The work reaches you either way.',
    ],
  },
  {
    h: 'The work arrives already described',
    body: [
      'Every job comes with what you’d otherwise ask on the phone: the acreage — often measured off a boundary the customer drew on a map — the postcode district, access notes, gate width and photographs, checked before it reaches you.',
      'Enough to price sitting in the yard, without a wasted trip to look at it.',
    ],
  },
  {
    h: 'You never chase a customer for money',
    body: [
      'The customer pays a deposit to book the job, so nobody turns up to work that was never really going ahead, and the balance once it’s done and signed off.',
      'You send us one invoice and we pay it. You are not ringing a farm office in November about a field you topped in August.',
    ],
  },
  {
    h: 'It costs nothing to be on the list',
    body: [
      'No joining fee, no monthly fee, and no commission taken off your invoice.',
      'You keep the price you quote — our margin sits on top of it and the customer pays that, so nothing comes out of your number.',
    ],
  },
];

/** What actually happens, from a job landing to the money arriving. */
const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: 'A job comes in for your county',
    body: 'A customer describes what needs doing. We check it over, work out the details and email it to the contractors covering that ground — you among them.',
  },
  {
    n: 2,
    title: 'You price it, or you pass',
    body: 'One tap either way, from the email. No obligation to quote and no cost to quote. The price you give is your price for the job as described.',
  },
  {
    n: 3,
    title: 'You do the work, we pay you',
    body: 'If the customer takes your price they pay a deposit and you get their details. Do the work, mark it complete, send us your invoice.',
  },
];

const ASKS: { h: string; body: string }[] = [
  {
    h: 'Price it while the job’s still live',
    body: 'Customers see prices as they arrive and can accept at any moment. There’s no deadline pressure from us — but the sooner you come back, the better your chances of it being yours.',
  },
  {
    h: 'Turn up when you said you would',
    body: 'Contact the customer within 24 hours of winning the job, and do the work on the day you agreed. That is the whole arrangement, and it’s what keeps the next job coming.',
  },
];

const faqs = [
  {
    q: 'What does it cost to join?',
    a: 'Nothing. Registration is free, quoting is free, there is no monthly fee, and nothing is deducted from your invoice. You keep the price you quote — our margin is added on top and paid by the customer.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'The customer pays a deposit to book the job, and the balance falls due once the work is done and they have confirmed it — or automatically three working days after you mark it complete, if they neither confirm nor raise a problem. You are paid your full quoted price once that balance has cleared and we have your invoice. You never invoice the customer yourself.',
  },
  {
    q: 'What happens if the customer doesn’t pay?',
    a: 'That is ours to deal with, not yours. A deposit is taken before you start work, and if the balance goes unpaid we chase it — and will pursue the debt until it is paid, formally if it comes to that. You are not the one making those phone calls.',
  },
  {
    q: 'Do I have to quote for everything I’m sent?',
    a: 'No. There is no obligation to quote and no cost to quote. Price the jobs that suit your kit and your diary, and pass on the rest — passing costs you nothing and does not count against you.',
  },
  {
    q: 'Do I set my own prices?',
    a: 'Yes. Every price is yours. We never quote on your behalf and we never change the figure you give us.',
  },
  {
    q: 'Which jobs will I be sent?',
    a: 'Work in the counties you tell us you cover, for the services you tell us you do, and nothing else. You can change either at any time.',
  },
  {
    q: 'Is there a check before I start getting work?',
    a: 'Yes, though it is a light one. Registration is free and subject to approval: we check who you are and that you are a working contracting business, and we speak to you before any job reaches you.',
  },
  {
    q: 'Do I need my own insurance and certificates?',
    a: 'Work done through us is covered by our own public liability policy, so you do not need to hold cover of your own to take jobs from us. We do not ask to see spraying, chainsaw or machinery certificates either — what you are qualified and ticketed to operate is your responsibility as an independent business, not something we sit in judgement on.',
  },
  {
    q: 'What do you get out of it?',
    a: 'The customer pays us for arranging the work and standing behind it. It does not come out of your price.',
  },
  {
    q: 'How much work will I get?',
    a: 'It depends on your county and the time of year — topping in high summer and hedge cutting after the nesting season are the busy stretches. We would rather tell you straight than promise a number we cannot stand behind.',
  },
  {
    q: 'What kind of outfit is this for?',
    a: 'Agricultural contractors with their own machinery, from a one-tractor operation upwards. Whether you top a handful of paddocks around other work or run a full contracting business, the jobs are the same jobs.',
  },
];

/** The busiest counties on show; the rest behind a toggle, so a phone isn't scrolling for ever. */
const FIELDS_SHOWN = 9;

/** One card per county — a field, headed with a strip of mown stripes. */
function CountyFields({ counties }: { counties: CountyJobs[] }) {
  return (
    <ul className={c.fields}>
      {counties.map(({ county, jobs }) => (
        <li key={county} className={c.field}>
          <div className={c.fieldHead}>
            <h3 className={c.fieldName}>{county}</h3>
            <span className={c.fieldCount}>
              {jobs.length} job{jobs.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className={c.fieldJobs}>
            {jobs.map((job, i) => (
              <li key={i} className={c.fieldJob}>
                <span>{job.service}</span>
                {job.size && <span className={c.fieldSize}>{job.size}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default async function AgriculturalContractorsPage() {
  const [services, coverage, openJobs] = await Promise.all([
    getServices(),
    getCountyCoverage(),
    getOpenJobsByCounty(),
  ]);
  const coveredCount = UK_COUNTY_NAMES.filter((n) => (coverage[n] ?? 0) > 0).length;
  const openCount = openJobs.reduce((n, c) => n + c.jobs.length, 0);

  return (
    <div className={a.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: TITLE,
            description: DESCRIPTION,
            url: `${SITE}/agriculturalcontractors`,
            about: {
              '@type': 'Organization',
              name: 'Emmerdale Agriculture',
              legalName: COMPANY_LEGAL_NAME,
              url: SITE,
              areaServed: { '@type': 'AdministrativeArea', name: SERVICE_AREA },
            },
          }),
        }}
      />

      <SiteHeader />

      <main className={a.main}>
        <div className={a.wide}>
          {/* No breadcrumb: this sits directly under Home, so the trail would
              be one link the header already gives, and it renders as a second
              eyebrow immediately above the real one. */}
          <div className={a.eyebrow}>For agricultural contractors</div>
          <h1 className={`${a.title} ${c.heroTitle}`}>
            The jobs <em>come to you.</em>
          </h1>
          <p className={`${a.sub} ${c.heroSub}`}>
            Farmers, smallholders and paddock owners tell us what needs doing.
            We put it in front of the contractors covering that ground. You
            price the jobs that suit your kit and your diary, and get on with
            the work you&rsquo;re good at.
          </p>

          <ul className={c.trust}>
            {[
              'Free to join',
              'You set the price',
              'No commission',
              'Paid on your invoice',
              `${coveredCount} counties covered`,
            ].map((t) => (
              <li key={t} className={c.trustItem}>
                {t}
              </li>
            ))}
          </ul>

          <div className={c.heroCta} id="join">
            {/* Same event as the homepage operators band, so the supply
                funnel stays comparable across both entry points. */}
            <TrackedLink
              href="/signup"
              event="operator_apply"
              params={{ location: 'contractors_hero' }}
              className={f.btnPrimary}
            >
              Join the network →
            </TrackedLink>
            <p className={c.heroMeta}>
              Free to join. No monthly fee. Nothing comes off your invoice.
            </p>
          </div>
        </div>
      </main>

      {/* The work on the board today. Hidden when there is none: an empty
          board is not an argument for joining. */}
      {openCount > 0 && (
        <section className={`${s.section} ${c.board}`}>
          <div className={s.sectionInner}>
            <div className={s.kicker}>On the board today</div>
            <h2 className={s.sectionTitle}>
              {openCount} jobs waiting <em>for a price.</em>
            </h2>
            <p className={s.sectionLede}>
              Work customers have asked for across {openJobs.length} counties,
              out with local contractors now and still taking prices. Join and
              the ones in your patch come to you.
            </p>
            <div className={c.boardGrid}>
              <figure className={c.boardMapWrap}>
                <Image
                  src="/jobs-map.svg"
                  alt={`Map of Great Britain with the ${openJobs.length} counties that have open jobs shaded green`}
                  width={730}
                  height={1357}
                  unoptimized
                  className={c.boardMap}
                />
                <figcaption className={c.boardKey}>
                  <span><i style={{ background: '#86b267' }} />1 job</span>
                  <span><i style={{ background: '#4f8638' }} />2</span>
                  <span><i style={{ background: '#245018' }} />3 or more</span>
                </figcaption>
              </figure>
              <div>
                <CountyFields counties={openJobs.slice(0, FIELDS_SHOWN)} />
                {openJobs.length > FIELDS_SHOWN && (
                  <details className={c.moreFields}>
                    <summary>
                      {openJobs.length - FIELDS_SHOWN} more counties with work on
                    </summary>
                    <CountyFields counties={openJobs.slice(FIELDS_SHOWN)} />
                  </details>
                )}
              </div>
            </div>
            <div className={c.boardCta}>
              <TrackedLink
                href="/signup"
                event="operator_apply"
                params={{ location: 'contractors_board' }}
                className={f.btnPrimary}
              >
                Join to price them →
              </TrackedLink>
            </div>
          </div>
        </section>
      )}

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>What you stop doing</div>
          <h2 className={s.sectionTitle}>
            We do the chasing, <em>you do the work.</em>
          </h2>
          <p className={s.sectionLede}>
            Everything between a customer wanting a field done and the money
            reaching your account is ours to sort out.
          </p>
          <div className={c.reasons}>
            {REASONS.map((r) => (
              <div key={r.h} className={c.reason}>
                <h3 className={c.reasonH}>{r.h}</h3>
                {r.body.map((para) => (
                  <p key={para} className={c.reasonBody}>
                    {para}
                  </p>
                ))}
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
          <p className={s.sectionLede}>
            Three steps, and two of them are the job itself.
          </p>
          <div className={s.steps}>
            {STEPS.map((step) => (
              <div key={step.n} className={s.step}>
                <div className={s.stepNum}>{step.n}</div>
                <div className={s.stepTitle}>{step.title}</div>
                <p className={s.stepBody}>{step.body}</p>
              </div>
            ))}
          </div>
          {/* Priority Access: standing earned by booking through the platform
              (20261001160000_priority_access_shadow). */}
          <p className={s.sectionLede} style={{ marginTop: 28 }}>
            <strong>Book through us and you go to the front of the queue.</strong>{' '}
            Contractors who book jobs on the platform are given priority on new
            jobs as they come in: you hear about work in your area first, before
            it goes out to everyone else. The more you book, the higher your
            priority.
          </p>
        </div>
      </section>

      <ServicesSection
        alt
        services={services}
        title={
          <>
            The work that <em>comes through.</em>
          </>
        }
        lede="Tell us which of these you’re set up for and you’ll only hear about those. Anything you don’t do, you never see."
      />

      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>Where we cover</div>
          <h2 className={s.sectionTitle}>
            Contractors in {coveredCount} counties — <em>and growing.</em>
          </h2>
          <p className={s.sectionLede}>
            The network runs across {SERVICE_AREA}, deepest around our Hampshire
            heartland and spreading out from there. Thin coverage in your county
            is good news, not bad — it means the work that comes in has fewer
            people to go to.
          </p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.sectionInner}>
          <div className={s.kicker}>All we ask</div>
          <h2 className={s.sectionTitle}>
            Two things, <em>and they&rsquo;re the obvious two.</em>
          </h2>
          <p className={s.sectionLede}>
            They&rsquo;re also the two the customer is judging you on, so
            they&rsquo;re in your interest before they&rsquo;re in ours.
          </p>
          <div className={c.ask}>
            {ASKS.map((item) => (
              <div key={item.h} className={c.askItem}>
                <h3 className={c.askH}>{item.h}</h3>
                <p className={c.askBody}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CredSection>
        Emmerdale Agriculture is run by the people behind{' '}
        <a href={HPM_URL}>Hampshire Paddock Management</a>{' '}
        — a contracting firm that tops, harrows, rolls and sprays paddocks for a
        living. We know what it is to price a job off a photograph, and what a
        wasted trip across three counties costs. That is why the job packs are
        checked before they reach you.
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
          The full commercial terms are on the{' '}
          <Link href="/terms">contractor terms</Link> page — how jobs reach you,
          how you price them, and how and when you are paid. If something
          isn&rsquo;t answered there either, <Link href="/contact">ask us</Link>.
        </p>
      </FaqSection>

      <section className={c.closing} id="join-end">
        <div className={c.closingInner}>
          <h2 className={c.closingTitle}>
            Put your kit in front of <em>the people looking for it.</em>
          </h2>
          <p className={c.closingBody}>
            Two minutes to register, then a few questions about your business
            and the counties you cover. We review every application and email
            you when you&rsquo;re approved.
          </p>
          <TrackedLink
            href="/signup"
            event="operator_apply"
            params={{ location: 'contractors_footer' }}
            className={f.btnPrimary}
          >
            Join the network →
          </TrackedLink>
          <p className={c.closingMeta}>
            Already registered? <Link href="/login">Sign in</Link>.
          </p>
        </div>
      </section>

      <FloatingJoin href="/signup" location="contractors_float" after="join" until="join-end" />
      <SiteFooter />
    </div>
  );
}
