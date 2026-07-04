import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER } from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>Contractor terms</h1>
          <p className={l.updated}>{COMPANY_LEGAL_NAME} · Company No. {COMPANY_NUMBER}</p>

          <div className={l.note}>
            Draft for review. Covers the controller-to-controller obligation and the
            basic terms of using the network. Have it reviewed by a solicitor before
            launch.
          </div>

          <h2>The network</h2>
          <p>
            The Emmerdale Agriculture network passes overflow paddock and land jobs
            to registered contractors. Registration is free. We match jobs to
            contractors by county and award work by competitive bid. We handle no
            customer payments — you invoice the customer directly.
          </p>

          <h2>Use of customer details</h2>
          <p>
            When you win a job (or, as a paid member, access a job’s details), you
            receive the customer’s contact information. You agree to use those
            details <strong>solely to respond to and carry out that specific
            enquiry</strong>. You must not use customer details for marketing, pass
            them to any third party, or retain them beyond what is necessary for the
            job. You act as an independent data controller for any customer data you
            receive.
          </p>

          <h2>Approval and conduct</h2>
          <p>
            Registration is subject to approval, and we may suspend an account at our
            discretion. You are responsible for carrying out work you win to a
            professional standard, and for holding appropriate insurance.
          </p>

          <h2>Bidding</h2>
          <p>
            Bids are binding offers to carry out the work at the quoted price. At the
            close of bidding, the lowest bid is awarded automatically unless an
            administrator awards otherwise. You may revise your bid until bidding
            closes.
          </p>

          <h2>No guarantee of work</h2>
          <p>
            We do not guarantee any volume of jobs or that you will win any
            particular job. The network exists to pass on work {COMPANY_LEGAL_NAME}
            cannot carry out itself.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
