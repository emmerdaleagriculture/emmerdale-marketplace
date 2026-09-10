import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COMPANY_ADDRESS_LINES, COMPANY_REG_PROSE } from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Customer service charter',
  description:
    'What to expect from Emmerdale Agriculture before you book, while the work is done, and if anything goes wrong.',
  alternates: { canonical: '/service-charter' },
};

/**
 * The plain-English promise that sits alongside the customer terms and forms
 * part of them (terms clause 4). Version 2.0 states the deposit model: what
 * is paid when, and what a cancellation costs.
 */
export default function ServiceCharterPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>What to expect from us</h1>
          <p className={l.updated}>
            Emmerdale Agriculture — Customer Service Charter ·{' '}
            <strong>Version 2.0, 10 September 2026</strong>
          </p>
          <p>
            You are dealing with one company for the whole job: us. This is what that means
            in practice. It forms part of our{' '}
            <Link href="/customer-terms">Customer Terms and Conditions</Link>.
          </p>

          <h2>Before you book</h2>
          <p>
            <strong>One fixed price, upfront.</strong> You describe the job — service, area,
            postcode, access, photos — and we give you a single price that includes the
            contractor, our fee and VAT. No quotes from six different vans, no haggling, no
            surprises on the day.
          </p>
          <p>
            <strong>Honest about what we can do.</strong> If a job can&rsquo;t be priced
            properly from a description, we&rsquo;ll say so and arrange a site visit or tell
            you it isn&rsquo;t one for us.
          </p>
          <p>
            <strong>Vetted contractors.</strong> Every contractor on our platform has been
            checked: identity, insurance (public liability of at least £2m), the right
            certificates for the work (spraying, chainsaw, machinery), and an introductory
            call or supervised first job. They&rsquo;ve signed up to our Contractor Code of
            Conduct.
          </p>

          <h2>After you book</h2>
          <p>
            <strong>You pay in two parts.</strong> A 15% deposit by card books the job. The
            rest is only taken once the work is done and you&rsquo;ve confirmed you&rsquo;re
            happy with it — from the same card, within 7 days of you signing the job off. The
            contractor isn&rsquo;t paid until then.
          </p>
          <p>
            <strong>Contact within 24 hours.</strong> The contractor assigned to your job will
            get in touch within a day to introduce themselves and agree a date and arrival
            window. If they don&rsquo;t, tell us and we&rsquo;ll chase or reassign.
          </p>
          <p>
            <strong>They turn up when they say.</strong> Confirmation the day before. Arrival
            within the agreed window. If they&rsquo;re going to be more than 30 minutes late
            or can&rsquo;t make it, you&rsquo;ll hear before the window starts and be offered a
            new date within 7 days.
          </p>
          <p>
            <strong>A walk round first.</strong> If you&rsquo;re there, the contractor will
            walk the site with you: boundaries, gates, hazards, livestock, anything to avoid.
          </p>
          <p>
            <strong>Photographs before and after.</strong> The contractor photographs the site
            before starting and again when finished — same angles — and they&rsquo;re uploaded
            to your job page the same day. You can see exactly what was done, even if you
            weren&rsquo;t there.
          </p>
          <p>
            <strong>Respect for your property.</strong> Gates closed. Agreed routes kept to. No
            rutting, no damage to verges, drives, fences or hedges outside the job. Horses and
            livestock never worked around without a plan agreed with you. No smoking, vaping
            or alcohol on your land. Site left clean — string, netting, packaging and offcuts
            gone.
          </p>
          <p>
            <strong>If anything gets damaged, you&rsquo;ll be told.</strong> The same day, by
            the contractor and by us. Never hidden.
          </p>

          <h2>When the job is done</h2>
          <p>
            <strong>You confirm, then the rest is paid.</strong> When the job is marked
            complete you get an email. You have three working days to confirm or tell us about
            a problem. Only once you&rsquo;ve confirmed — or those three days have passed
            without a word — do we take the balance and pay the contractor. If you raise a
            problem, nothing is taken while we sort it out.
          </p>
          <p>
            <strong>Put-right guarantee.</strong> If the work is incomplete or not to a
            reasonable standard, we arrange for it to be put right within 7 days at no cost to
            you. If that isn&rsquo;t possible, we reduce the price by an appropriate amount.
          </p>
          <p>
            <strong>Insured.</strong> We carry £5 million of public liability cover on work
            done through our service, on top of each contractor&rsquo;s own insurance. If
            something goes wrong, we manage the claim with you.
          </p>

          <h2>If you need to cancel</h2>
          <p>
            You can cancel any time before work starts. The deposit isn&rsquo;t refunded — it
            covers the matching and scheduling already done and any call-out owed to the
            contractor — and nothing more is taken. If we cancel — no contractor available, or
            the job can&rsquo;t be done safely or lawfully — you get your deposit back in full.
            Weather reschedules cost nothing.
          </p>

          <h2>How to reach us</h2>
          <p>
            Through your job page, by email, or by phone on the number shown on your job page.
            We acknowledge every problem within one working day and tell you what we propose
            within three.
          </p>

          <p className={l.updated}>
            Emmerdale Agriculture is a trading name of {COMPANY_REG_PROSE}. Registered office:{' '}
            {COMPANY_ADDRESS_LINES.join(' ')}
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
