import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  COMPANY_ADDRESS_LINES,
  COMPANY_LEGAL_NAME,
  COMPANY_REG_PROSE,
} from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Customer terms and conditions',
  description: `The terms on which ${COMPANY_LEGAL_NAME} arranges land, paddock and rural maintenance work.`,
  alternates: { canonical: '/customer-terms' },
};

/**
 * The customer contract, as a page rather than a PDF (v1.0, 5 Sept 2026, was
 * a PDF). Version 2.0 is the deposit model: 15% to book, the balance charged
 * to the same card on sign-off, the deposit forfeited on cancellation.
 *
 * Clause numbers are load-bearing. 7.2 (auto-confirm), 9.1–9.3 (cancelling)
 * and the Cancellation Schedule are cited by name in SQL comments, event-log
 * reasons and the contractor terms, so the numbering from v1.0 is kept even
 * where a clause's substance changed.
 */
export default function CustomerTermsPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>Customer terms and conditions</h1>
          <p className={l.updated}>
            {COMPANY_REG_PROSE}, registered office {COMPANY_ADDRESS_LINES.join(' ')}, trading
            as Emmerdale Agriculture at emmerdaleagriculture.com (<strong>we</strong>,{' '}
            <strong>us</strong>, <strong>Emmerdale Agriculture</strong>).
            <br />
            <strong>Version 2.0 — 10 September 2026</strong>
          </p>

          <p>
            Please read these Terms before you accept a price. By accepting a price and paying
            the deposit, you agree to them. They are written in plain English on purpose; if
            anything is unclear, ask us before you pay.
          </p>

          <h2>1. Who we are and what we do</h2>
          <p>
            1.1 We run an online service through which you can request land, paddock,
            equestrian-property and rural maintenance work (a <strong>Job</strong>), receive a
            fixed price, pay online, and have the work carried out by an approved independent
            contractor (a <strong>Contractor</strong>) that we select and manage.
          </p>
          <p>
            1.2 <strong>Your contract is with us.</strong> We are responsible to you for the Job
            being done to the standard in these Terms. The Contractor works for us, not for
            you. You do not pay the Contractor and the Contractor will not ask you to.
          </p>
          <p>
            1.3 We are not a lead-generation site. We choose the Contractor, set the price,
            take your payment in two parts — a deposit to book and the balance once you have
            confirmed the work is done — and deal with any problem.
          </p>

          <h2>2. Requesting a Job and getting a price</h2>
          <p>
            2.1 You describe the Job on our website: the service, the area (by acreage or by
            drawing the boundary on our map), the postcode, access details, photographs and
            anything a contractor should know. You confirm that the information is accurate
            and that you own the land or have the owner&rsquo;s authority to have the work
            done.
          </p>
          <p>
            2.2 We match your Job to approved Contractors in your county and obtain quotes. We
            then show you a single <strong>Price</strong>. The Price includes the
            Contractor&rsquo;s charge, our service fee and VAT where applicable. It is fixed
            for the Job as described.
          </p>
          <p>
            2.3 A Price is valid for the period shown when we send it (usually 7 days). After
            that it may change or be withdrawn.
          </p>
          <p>
            2.4 Some Jobs cannot be priced remotely. If so we will tell you and either arrange a
            site visit or decline the Job.
          </p>

          <h2>3. Accepting and paying</h2>
          <p>
            3.1 <strong>The deposit.</strong> You accept a Price by clicking &ldquo;Accept and
            book&rdquo; and paying a deposit of <strong>15% of the Price</strong> by card
            through our payment provider (Stripe). Your contract with us starts when the
            deposit is confirmed.
          </p>
          <p>
            3.2 <strong>The balance.</strong> The remaining 85% of the Price falls due when you
            confirm the Job is complete, or when the confirmation period in clause 7 has
            passed. By paying the deposit you authorise us to charge the balance to the same
            card at that point. The balance is payable within <strong>7 days</strong> of it
            falling due. If we cannot take it from your card — for example because the card
            has expired or your bank asks you to approve the payment — we will tell you, and
            you can pay it from your Job page.
          </p>
          <p>
            3.3 If you are paying as a business, you confirm that you are authorised to do so.
            Prices shown to businesses may be stated exclusive of VAT.
          </p>

          <h2>4. What happens next — our commitments to you</h2>
          <p>Once you have paid the deposit:</p>
          <ol type="a">
            <li>
              We assign a Contractor and tell you who they are (business name, and the name of
              the person attending).
            </li>
            <li>
              The Contractor will <strong>contact you within 24 hours</strong> to agree a date
              and an arrival window. If they do not, tell us and we will chase or reassign.
            </li>
            <li>The Contractor will confirm the appointment the working day before.</li>
            <li>
              The Contractor will <strong>arrive within the agreed window</strong>. If they are
              running more than 30 minutes late or cannot attend, you will be told before the
              window starts and offered a new date within 7 days.
            </li>
            <li>
              The Contractor will walk the site with you if you are present, and will take{' '}
              <strong>before and after photographs</strong> of the work, which you can see on
              your Job page.
            </li>
            <li>
              The Contractor will carry out the Job with reasonable skill and care, respect
              your property, animals and boundaries, close gates, and leave the site clean.
            </li>
            <li>When the Job is marked complete you will be asked to confirm it (clause 7).</li>
          </ol>
          <p>
            Our full service promise is in the{' '}
            <Link href="/service-charter">Customer Service Charter</Link>, which forms part of
            these Terms.
          </p>

          <h2>5. Your responsibilities</h2>
          <p>
            5.1 Give us accurate information about the Job, the site and access. If the Job is
            materially different from what you described, the Contractor may stop and we may
            re-price it (clause 6).
          </p>
          <p>
            5.2 Make sure the site is accessible at the agreed time: gates unlocked, access
            routes clear, vehicles moved, and any hazards or buried services pointed out.
          </p>
          <p>
            5.3 Move or secure animals as agreed with the Contractor before work starts.
            Machinery must not be operated in a field with horses unless you and the
            Contractor have agreed how they will be managed.
          </p>
          <p>5.4 Be contactable on the day, or nominate someone who is.</p>
          <p>
            5.5 Do not ask the Contractor to do additional work, or work off-platform. Extras go
            through us (clause 6) so they are recorded, insured and covered by these Terms.
          </p>
          <p>
            5.6 If you fail to provide access at the agreed time and the Contractor cannot
            work, the Cancellation Schedule applies as if you had cancelled with less than 48
            hours&rsquo; notice.
          </p>

          <h2>6. Changes and extras</h2>
          <p>
            6.1 If you want to change the scope, or the Contractor finds the site is materially
            different from your description, we will send you a revised Price. Work continues
            only when you have accepted the revision. The difference is added to, or taken off,
            your balance.
          </p>
          <p>
            6.2 Reductions in scope after booking are treated as a partial cancellation of the
            removed part, and the Cancellation Schedule applies to that part.
          </p>

          <h2>7. Confirming completion and paying the balance</h2>
          <p>
            7.1 When the Contractor marks the Job complete, with photographs uploaded, we will
            email you. You then have <strong>3 working days</strong> to either confirm
            completion or tell us about a problem.
          </p>
          <p>
            7.2 If you do neither within 3 working days, the Job is treated as confirmed. The
            balance then falls due under clause 3.2 and we pay the Contractor.
          </p>
          <p>
            7.3 If you tell us about a problem, we do not take the balance while we deal with
            it under clause 8.
          </p>

          <h2>8. If something goes wrong</h2>
          <p>
            8.1 We want to know. Tell us through your Job page, by email or by phone within the
            3 working days in clause 7, with photographs where possible.
          </p>
          <p>
            8.2 We will acknowledge within one working day and tell you what we propose within
            3 working days.
          </p>
          <p>
            8.3 If the work is incomplete or not to a reasonable standard, we will arrange for
            the Contractor (or another Contractor) to{' '}
            <strong>return and put it right within 7 days</strong>, at no cost to you. If that
            is not possible or you reasonably refuse, we will reduce the Price by an
            appropriate amount — taken off your balance, or refunded from your deposit where
            the reduction is more than the balance.
          </p>
          <p>
            8.4 If the Contractor damages your property, tell us and the Contractor on the day.
            The Contractor is required to report it too. We carry public liability insurance
            of <strong>£5,000,000</strong> covering work done through our service, and we
            require every Contractor to hold their own insurance. We will manage the claim with
            you.
          </p>
          <p>
            8.5 If you are a consumer, nothing in these Terms takes away your rights under the
            Consumer Rights Act 2015, including the right to have a service performed with
            reasonable care and skill and, where it is not, to repeat performance or a price
            reduction.
          </p>

          <h2>9. Cancelling</h2>
          <p>
            9.1 You can cancel a Job at any time before the work starts, on your Job page or by
            emailing us.
          </p>
          <p>
            9.2 <strong>The deposit is the cancellation fee.</strong> If you cancel after
            booking and before the work starts, we keep the deposit and take nothing further.
            The deposit covers the matching, scheduling and administration we have already
            carried out, and any call-out we pay the Contractor.
          </p>
          <p>
            9.3 If you cancel after the Contractor has started work, you pay for the work done
            to date plus 15% of the remainder of the Price. Your deposit counts towards that
            amount; we charge the difference to your card, or refund it, as the case may be.
          </p>
          <p>
            9.4 If you are a consumer, you also have a legal right to cancel within 14 days of
            booking under the Consumer Contracts (Information, Cancellation and Additional
            Charges) Regulations 2013. By accepting a Price you ask us to begin providing the
            service (matching and scheduling a Contractor) straight away. If you cancel within
            those 14 days, we will refund your deposit less a proportionate charge for the
            service already provided up to the point of cancellation, which we set at the
            whole deposit once a Contractor has been assigned to your Job, and at nil — a full
            refund of the deposit — if no Contractor has yet been assigned.
          </p>
          <p>
            9.5 <strong>If we cancel.</strong> If we cannot find a Contractor, or the
            Contractor cannot attend and we cannot offer you a new date within 7 days, or the
            Job cannot lawfully or safely be done, we will cancel and refund your deposit in
            full. No fee is charged and no balance is taken.
          </p>
          <p>
            9.6 <strong>Weather and safety.</strong> Field work depends on ground and weather
            conditions. If the Contractor judges that the work cannot be done safely or
            properly on the day, it will be rescheduled within 7 days at no extra cost. This is
            not a cancellation by either side.
          </p>

          <h2>10. Prices, payment and refunds</h2>
          <p>
            10.1 All Prices are in pounds sterling. Where VAT applies it is included in the
            Price shown to consumers.
          </p>
          <p>
            10.2 Payment is by card through Stripe. We do not see or store your full card
            details. Stripe keeps your card on file so that the balance can be taken under
            clause 3.2; we hold only Stripe&rsquo;s reference to it.
          </p>
          <p>
            10.3 Refunds go back to the card you paid with, normally within 5 working days of
            our decision.
          </p>

          <h2>11. Our liability to you</h2>
          <p>
            11.1 We are responsible for loss or damage you suffer that is a foreseeable result
            of our breaking these Terms or failing to use reasonable care and skill. We are not
            responsible for loss that is not foreseeable, or for business losses if you are
            using our service for a business.
          </p>
          <p>
            11.2 Where you are a business, our total liability to you in connection with a Job
            is limited to the Price of that Job.
          </p>
          <p>
            11.3 Nothing in these Terms limits or excludes our liability for death or personal
            injury caused by negligence, for fraud, or for anything that cannot be limited by
            law.
          </p>
          <p>
            11.4 We are not responsible for delays or failures caused by events outside our
            reasonable control, including severe weather, flooding, animal disease
            restrictions, road closures or the acts of third parties, but we will tell you as
            soon as we can and reschedule or refund.
          </p>

          <h2>12. Your information</h2>
          <p>
            12.1 We use your details to provide the service, to pay Contractors, to keep
            records and to contact you about your Job. We share with the assigned Contractor
            only what they need to do the work: your name, contact details, the site address
            and access details, the Job description and your photographs. Contractors must
            keep this confidential and delete it after the Job.
          </p>
          <p>
            12.2 Our <Link href="/privacy">Privacy Notice</Link> explains this in full,
            including your rights. We are the data controller.
          </p>
          <p>
            12.3 Before and after photographs of the work belong to us. We may use them, with
            identifying features removed, to show our services. Tell us if you would rather we
            did not.
          </p>

          <h2>13. Reviews</h2>
          <p>
            We may invite you to rate and review the work. Reviews must be honest and about
            your own experience. We may publish them, with your first name and county.
          </p>

          <h2>14. General</h2>
          <p>
            14.1 These Terms and the Customer Service Charter are the whole agreement between
            you and us for the Job.
          </p>
          <p>14.2 We may update these Terms. The version you accepted applies to your Job.</p>
          <p>14.3 If any part of these Terms is found unenforceable, the rest continues to apply.</p>
          <p>
            14.4 These Terms are governed by the law of England and Wales. If you are a
            consumer living in Scotland or Northern Ireland you may also bring proceedings
            there.
          </p>
          <p>
            14.5 If you are unhappy with how we have handled a complaint, you can use the
            online dispute resolution options available to consumers, or take the matter to
            court. We will always try to resolve it with you first.
          </p>

          <h2>Cancellation Schedule</h2>
          <div className={l.tableWrap}>
            <table className={l.schedule}>
              <thead>
                <tr>
                  <th>Situation</th>
                  <th>What you pay</th>
                  <th>What you get back</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>You cancel after booking, before work starts (any notice period)</td>
                  <td>The deposit (15% of the Price)</td>
                  <td>Nothing further is taken</td>
                </tr>
                <tr>
                  <td>You cancel after work has started</td>
                  <td>Value of work done, plus 15% of the remainder</td>
                  <td>
                    Your deposit is credited against this; the difference is charged or
                    refunded
                  </td>
                </tr>
                <tr>
                  <td>You fail to give access at the agreed time and the Contractor cannot work</td>
                  <td>The deposit</td>
                  <td>Nothing further is taken — or a reschedule at no extra cost if we can</td>
                </tr>
                <tr>
                  <td>
                    We cancel (no Contractor, no new date within 7 days, or the Job cannot
                    lawfully or safely be done)
                  </td>
                  <td>Nothing</td>
                  <td>Your deposit, in full</td>
                </tr>
                <tr>
                  <td>Weather or safety reschedule</td>
                  <td>Nothing</td>
                  <td>Job rescheduled within 7 days</td>
                </tr>
                <tr>
                  <td>
                    Consumer cancelling within 14 days of booking, before a Contractor is
                    assigned
                  </td>
                  <td>Nothing</td>
                  <td>Your deposit, in full</td>
                </tr>
                <tr>
                  <td>
                    Consumer cancelling within 14 days of booking, after a Contractor is
                    assigned
                  </td>
                  <td>The deposit (proportionate charge for service provided)</td>
                  <td>Nothing further is taken</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
