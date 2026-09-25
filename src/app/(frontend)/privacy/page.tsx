import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  COMPANY_ADDRESS_LINES,
  COMPANY_LEGAL_NAME,
  COMPANY_REG_PROSE,
  CONTACT_EMAIL,
} from '@/lib/site';
import a from '../auth.module.css';
import { Breadcrumb } from '@/components/Breadcrumb';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${COMPANY_LEGAL_NAME} collects, uses and shares personal data for customers and contractors.`,
  alternates: { canonical: '/privacy' },
};

/**
 * Written from what the code does, not from what it used to do (v1 described
 * the retired job board, where contractors were handed a customer's details
 * to call them). If a data flow changes — a new processor, a new field shown
 * to contractors before award, a new tracker — this page changes with it.
 *
 * The two things most easily got wrong:
 *  - Before a price is accepted, contractors DO see the customer's own words,
 *    the pin and drawn boundary on a satellite map, and the photographs. Only
 *    name, email and phone are held back. Don't write "contractors see nothing
 *    until you accept".
 *  - Retention periods below are commitments. Nothing deletes on a schedule
 *    yet apart from page_events (90 days); the jobs that enforce the rest must
 *    exist before the oldest data reaches them.
 */
export default function PrivacyPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <Breadcrumb tone="light" items={[{ label: 'Privacy policy' }]} />
          <h1>Privacy policy</h1>
          <p className={l.updated}>
            <strong>Version 2.0 — 25 September 2026</strong>
          </p>

          <h2>Who we are</h2>
          <p>
            Emmerdale Agriculture is run by {COMPANY_REG_PROSE}, registered office{' '}
            {COMPANY_ADDRESS_LINES.join(' ')} (<strong>we</strong>, <strong>us</strong>). We
            arrange land, paddock and rural work: customers tell us about a job, approved
            independent contractors price it, and the customer books the one they choose. We
            are the data controller for the personal data described here.
          </p>
          <p>
            Questions about your data, or to use any of your rights:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>If you ask us for a job</h2>
          <p>We collect what you give us on the job form and afterwards:</p>
          <ul>
            <li>
              <strong>The job:</strong> your description in your own words, the service, the
              area, urgency and dates, access notes, gate width, hazards and answers to our
              questions about the work.
            </li>
            <li>
              <strong>Where it is:</strong> your postcode, the pin you place, the boundary you
              draw on our map, and a what3words address for the gate if you give one. If you
              let your browser share your location to find the field, we use it for that.
            </li>
            <li>
              <strong>Photographs</strong> you upload. Photos can carry the location they were
              taken in their file data.
            </li>
            <li>
              <strong>Your name and email address</strong>, and your phone number if you give
              it.
            </li>
          </ul>
          <p>
            We save a job as you fill it in, before you press the final button, so you do not
            lose it. If you give us your email and do not finish, we may send you{' '}
            <strong>one reminder</strong>.
          </p>
          <p>
            If you create an account we also hold your login email and your password, stored
            only in scrambled (hashed) form that nobody can read back, and link your jobs to
            it.
          </p>

          <h2>What contractors see, and when</h2>
          <p>
            We send your job to approved contractors who cover your area so they can price it.{' '}
            <strong>Before you accept a price</strong>, each of them sees:
          </p>
          <ul>
            <li>your description of the job, in your own words;</li>
            <li>
              the pin and the boundary you drew, on a satellite map, with the postcode
              district (for example &ldquo;SO21&rdquo;) and county;
            </li>
            <li>your photographs, access notes, gate width and the other job details.</li>
          </ul>
          <p>
            They do <strong>not</strong> see your name, email address or phone number. Please
            leave those out of the description and photographs — anything you write there is
            shown to them as you wrote it.
          </p>
          <p>
            <strong>When you accept a price and pay the deposit</strong>, the contractor doing
            the job also receives your name, email address, phone number, full postcode, the
            location and the what3words address, so they can arrange and do the work. They
            must use these only for your job and delete them afterwards. They are responsible
            for how they handle them from then on.
          </p>
          <p>
            You can message contractors from your job page. Before you accept a price, a
            contractor is shown to you by a letter, and messages cannot contain phone numbers,
            email addresses or links. We keep messages with the job and can read them, and each
            side is emailed a copy of what the other sends.
          </p>

          <h2>If you enquire through an advert</h2>
          <p>
            If you fill in an enquiry form on Facebook or Instagram, Meta sends us the details
            you entered — typically your name, phone number, email address, postcode and what
            you need. We contact you about it. We only put it forward to contractors as a job
            once you have agreed to that, and we record when you did.
          </p>

          <h2>Payments</h2>
          <p>
            Card payments are handled by Stripe. We never see or store your card number. When
            you pay a deposit, Stripe keeps your card on file so the balance can be taken from
            the same card once you have confirmed the work is done, as the customer terms set
            out; we hold only Stripe&rsquo;s references to you and your card, and a record of
            what was paid, refunded and owed.
          </p>

          <h2>Ratings</h2>
          <p>
            After a job you can rate it and add a comment. Ratings count towards the
            contractor&rsquo;s average, which other customers see. We may publish a rating and
            comment on our site with your first name and county, as the customer terms say, and
            we show the service, price and stars of booked jobs without your name or location.
          </p>

          <h2>If you are a contractor</h2>
          <p>
            We hold your login email, business name, contact name, phone number, base postcode,
            the services and counties you cover, whether you want job emails, and your record
            with us: the jobs we sent you, whether you opened, priced or passed on them, your
            prices, notes and messages, ratings, and invoices you upload. If you reply to a job
            email, we read the reply to pick out a price or a decline (see &ldquo;Who else
            handles your data&rdquo;).
          </p>
          <p>
            Customers do not see your business name until they have accepted your price. After
            that they see your business name and any messages you send. Customer details you
            receive are covered by clause 7 of the{' '}
            <a href="/terms">contractor terms</a>.
          </p>

          <h2>Feedback and contacting us</h2>
          <p>
            If you use the feedback button we keep your message, your email if you give it or
            are signed in, the page you were on and your browser type. If you email or phone
            us, we keep what is needed to deal with it.
          </p>

          <h2>Security and site records</h2>
          <p>
            To stop abuse we record the IP address used for job requests and visits to our job
            form pages, along with the advert or link you arrived from. Our sign-up, login and
            job forms are protected by Cloudflare Turnstile, which checks you are not a bot. We
            use an error-monitoring service that is configured not to collect your details
            with an error report.
          </p>

          <h2>Cookies and tracking</h2>
          <ul>
            <li>
              <strong>Needed for the site to work:</strong> a login cookie if you sign in, and
              a short-lived cookie (2 hours) that brings you back to the job you just
              submitted.
            </li>
            <li>
              <strong>Analytics and advertising:</strong> Google Analytics, Google Ads and the
              Meta Pixel, which use their own cookies to measure visits and to tell us when an
              advert led to a job request. They are not loaded on job pages reached by a
              private link (your job page, a contractor&rsquo;s pricing page) or in our admin
              pages.
            </li>
            <li>
              <strong>Our own page measurement</strong> on the home page and job form records
              how far people scroll, what they click and which step they reach, without cookies
              or IP addresses. It is switched off if your browser sends Do Not Track or Global
              Privacy Control.
            </li>
          </ul>
          <p>
            You can block or delete cookies in your browser settings, and opt out of Google
            Analytics with Google&rsquo;s browser add-on.
          </p>

          <h2>Who else handles your data</h2>
          <p>
            We use these service providers to run the site. They process data for us, under
            contract, and only for these purposes.
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — our database, logins and file storage (hosted in
              Frankfurt).
            </li>
            <li>
              <strong>Vercel</strong> — hosts the website (servers in Frankfurt).
            </li>
            <li>
              <strong>Resend</strong> — sends our emails and receives replies to them.
            </li>
            <li>
              <strong>Stripe</strong> — card payments.
            </li>
            <li>
              <strong>Mapbox</strong> — the maps and satellite images, loaded by your browser.
            </li>
            <li>
              <strong>Postcodes.io</strong> — turns postcodes and locations into areas.
            </li>
            <li>
              <strong>Cloudflare</strong> — the Turnstile bot check.
            </li>
            <li>
              <strong>Sentry</strong> — error monitoring (EU region).
            </li>
            <li>
              <strong>Anthropic</strong> — reads the text of a contractor&rsquo;s emailed reply
              to a job, to pick out a price or a decline. Customer job descriptions are not sent
              to it.
            </li>
            <li>
              <strong>Google</strong> and <strong>Meta</strong> — analytics and advertising, as
              described under cookies, and Meta for enquiries made through its adverts.
            </li>
          </ul>
          <p>
            Some of these providers are based in, or use staff or servers in, the United States.
            Where your data leaves the UK, it is protected by the safeguards UK law requires,
            such as the UK Extension to the EU–US Data Privacy Framework or the
            International Data Transfer Addendum.
          </p>
          <p>
            We do not sell your data, and we do not share it with anyone else except where the
            law requires it.
          </p>

          <h2>Why we are allowed to use it</h2>
          <ul>
            <li>
              <strong>To provide the service you asked for</strong> (contract): pricing and
              booking your job, sending it to contractors, payments, messages and emails about
              the job, contractor accounts and payouts.
            </li>
            <li>
              <strong>Our legitimate interests</strong>: the one reminder about an unfinished
              job, preventing abuse, fixing errors, improving the site, and dealing with
              complaints and disputes.
            </li>
            <li>
              <strong>Consent</strong>: passing on an enquiry made through an advert, and
              using your browser location if you choose to share it.
            </li>
            <li>
              <strong>Legal obligation</strong>: keeping financial records.
            </li>
          </ul>

          <h2>How long we keep it</h2>
          <ul>
            <li>
              <strong>Jobs that went ahead</strong>, with their payments, messages and records:
              six years after the job, because the law requires financial records for that
              long and claims can be brought for that long.
            </li>
            <li>
              <strong>Jobs that did not go ahead</strong> — unfinished, cancelled before
              booking, or not priced: up to two years, then deleted.
            </li>
            <li>
              <strong>Visit and security records</strong> (IP addresses): up to 12 months. Our
              own page measurement: 90 days.
            </li>
            <li>
              <strong>Accounts</strong>: while the account is open, then as for the jobs linked
              to it.
            </li>
          </ul>

          <h2>Your rights</h2>
          <p>
            You can ask for a copy of your data, and ask us to correct it, delete it, restrict
            how we use it, or give it to you in a portable form. You can object to anything we
            do on the basis of our legitimate interests, and withdraw consent at any time. Some
            records we must keep — financial records, for example — even if you ask us to delete
            them; if so we will tell you.
          </p>
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will reply within
            a month. If you are unhappy with how we have handled your data, you can complain to
            the Information Commissioner&rsquo;s Office at{' '}
            <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.
          </p>

          <h2>Changes</h2>
          <p>
            We will update this page when what we do with data changes, and change the date at
            the top.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
