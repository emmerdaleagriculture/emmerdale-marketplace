import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COMPANY_LEGAL_NAME, COMPANY_REG_LINE } from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Contractor terms for the Emmerdale Agriculture network.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>Contractor terms</h1>
          <p className={l.updated}>{COMPANY_REG_LINE}</p>

          <h2>The network</h2>
          <p>
            The Emmerdale Agriculture network passes overflow paddock and land jobs
            to registered contractors. Registration is free. We match jobs to
            contractors by county; each job is visible to the registered contractors
            covering its area, and the customer chooses who they hire. We handle no
            customer payments — you invoice the customer directly.
          </p>

          <h2>Use of customer details</h2>
          <p>
            When you open a job, you
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
            discretion. You are responsible for carrying out work you take on to a
            professional standard, and for holding appropriate insurance.
          </p>

          <h2>Opening jobs</h2>
          <p>
            Opening a job shows you its full details and the customer’s contact
            information, and we record which contractors have opened each job. A job
            is not allocated to any one contractor: other contractors covering the
            area can open it too, and the customer decides who to engage. If you want
            the work, contact the customer promptly and agree the price directly with
            them.
          </p>

          <h2>No guarantee of work</h2>
          <p>
            We do not guarantee any volume of jobs or that you will win
            any particular job. The network exists to pass on work {COMPANY_LEGAL_NAME}
            cannot carry out itself.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
