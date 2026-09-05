import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COMPANY_REG_LINE } from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Contractor terms',
  description:
    'Contractor terms for the Emmerdale Agriculture network — how jobs reach you, how you price them, and how and when you are paid.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>Contractor terms</h1>
          <p className={l.updated}>Version 2.0 — 5 September 2026. {COMPANY_REG_LINE}</p>

          <p>
            These terms cover work you take on through Emmerdale Agriculture. They are
            written in plain English on purpose. If anything is unclear, ask us before
            you price a job. They sit alongside our{' '}
            <a href="/legal/customer-terms-and-conditions.pdf">customer terms</a> and{' '}
            <a href="/legal/customer-service-charter.pdf">service charter</a>, which set
            out what we promise the customer on every job you take on.
          </p>

          <h2>1. How this works now</h2>
          <p>
            The customer&rsquo;s contract is with us, not with you. We take the job,
            set the price the customer pays, take their money and hold it, and we are
            responsible to them for the work being done properly. You carry out the
            work for us as an independent contractor.
          </p>
          <p>
            You are not employed by us. You use your own machinery, decide how the work
            is done, and are responsible for your own tax and National Insurance.
          </p>

          <h2>2. Approval, insurance and certificates</h2>
          <p>
            Registration is free and subject to approval. To be approved and to stay
            approved you must hold public liability insurance of at least{' '}
            <strong>£2 million</strong> and the certificates required for the work you
            take on — spraying, chainsaw, machinery and so on. You must tell us if any
            of that lapses or changes, and give us evidence when we ask.
          </p>
          <p>
            We may suspend or remove an account where work falls short, where conduct
            towards a customer is unacceptable, or where insurance or certification
            cannot be evidenced.
          </p>

          <h2>3. Being invited, and pricing</h2>
          <p>
            Jobs are sent to approved contractors covering the county. Each invitation
            includes what the customer told us: the work, the acreage — often measured
            from a boundary they drew on a map — the postcode district, access notes,
            gate width and photographs. The full address and contact details come only
            if the job becomes yours.
          </p>
          <p>
            You price it or you pass. There is no obligation to quote and no cost to
            quote. A price you give is <strong>your price</strong> for the job as
            described, and it is valid for the period shown, usually 7 days.
          </p>

          <h2>4. What you are paid</h2>
          <p>
            You keep the price you quote. Our margin is added on top and is paid by the
            customer — it is not deducted from you. The customer sees a single price
            that includes both.
          </p>
          <p>
            The customer pays us in full before the work starts, and we hold that money.
            You are paid your full quoted price when the job is done and the customer
            confirms it — or automatically <strong>three working days</strong> after you
            mark it complete, if they neither confirm nor raise a problem.
          </p>
          <p>
            You do not invoice the customer and must not ask them for payment.
          </p>

          <h2>5. Changes, extras and problems</h2>
          <p>
            If the site is materially different from the description, stop and tell us.
            We will re-price it with the customer, and work continues once they have
            accepted and paid for the change. Do not agree extra work directly with the
            customer: it goes through us so it is recorded, insured and covered by these
            terms.
          </p>
          <p>
            If a customer raises a problem within their three working days, we hold the
            money while we deal with it. Where work is incomplete or not to a reasonable
            standard, we will ask you to return and put it right within 7 days at no cost
            to the customer. Where that is not possible, we may refund the customer an
            appropriate part of the price and reduce or withhold payment to you
            accordingly.
          </p>

          <h2>6. Cancellations</h2>
          <p>
            A customer can cancel before work starts. If you have already been booked and
            have incurred a call-out, tell us and we will agree what is owed to you out
            of the cancellation fee we retain. If a customer fails to give access at the
            agreed time, tell us the same day.
          </p>
          <p>
            If you cannot do a job you have taken, tell us as soon as you know so we can
            offer the customer a new date or reassign it. Repeatedly dropping accepted
            work is grounds for removal.
          </p>

          <h2>7. Customer information</h2>
          <p>
            When a job becomes yours we share only what you need to do it: the
            customer&rsquo;s name, contact details, the site address and access details,
            the job description and their photographs.
          </p>
          <p>
            You may use those details <strong>solely to carry out that job</strong>. Not
            for marketing, not passed to anyone else, and deleted once the job is
            finished and any query period has passed. You are an independent data
            controller for what you hold.
          </p>

          <h2>8. Working off the platform</h2>
          <p>
            Do not solicit a customer introduced through us for work outside the platform,
            and do not accept work from them off-platform for six months after a job. It
            is not about the fee — off-platform work has no insurance cover from us, no
            record, and no protection for either of you.
          </p>

          <h2>9. Ratings</h2>
          <p>
            Customers may rate and review work. Reviews are theirs, and we publish them
            with a first name and county. We will not remove a review for being
            unfavourable, but tell us if you believe one is untrue or not about your work.
          </p>

          <h2>10. No guarantee of work</h2>
          <p>
            We do not guarantee any volume of jobs, or that you will win any particular
            job. Customers choose from the prices they are shown.
          </p>

          <h2>11. General</h2>
          <p>
            Either of us can end this arrangement at any time. Jobs already accepted are
            seen through. We may update these terms; the version in force when you
            priced a job applies to that job. They are governed by the law of England and
            Wales.
          </p>
          <p>
            Questions: <a href="mailto:tom@emmerdaleagriculture.com">tom@emmerdaleagriculture.com</a>.
          </p>

          <h2>The previous job board</h2>
          <p>
            Until now, jobs were posted to a board, every covering contractor could open
            the customer&rsquo;s details, and you agreed a price and invoiced the customer
            directly. That board is being withdrawn. Any job you took through it is
            settled with the customer as before — these terms apply to work invited and
            priced through the new route. If you are mid-job and unsure which applies,{' '}
            <Link href="/account">ask us</Link>.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
