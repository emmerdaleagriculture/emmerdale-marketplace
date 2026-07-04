import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COMPANY_LEGAL_NAME, COMPANY_NUMBER } from '@/lib/site';
import a from '../auth.module.css';
import l from '../legal.module.css';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <article className={l.prose}>
          <h1>Privacy policy</h1>
          <p className={l.updated}>{COMPANY_LEGAL_NAME} · Company No. {COMPANY_NUMBER}</p>

          <div className={l.note}>
            Draft for review. This page states the disclosure, names the categories
            of recipient, and states retention as required. Have it reviewed by a
            solicitor before launch.
          </div>

          <h2>Who we are</h2>
          <p>
            The Emmerdale Agriculture contractor network is operated by{' '}
            {COMPANY_LEGAL_NAME} (Company No. {COMPANY_NUMBER}), the company behind
            Hampshire Paddock Management. We are the data controller for the personal
            data described here.
          </p>

          <h2>Customer enquiries and disclosure to contractors</h2>
          <p>
            When a customer asks us to arrange paddock or land work we cannot carry
            out ourselves, we pass their enquiry — including their name and contact
            details — to one or more vetted contractors in our network so they can
            contact the customer directly about the job. We only do this where the
            customer has given consent.
          </p>
          <p>
            <strong>Categories of recipient:</strong> vetted agricultural
            contractors registered with the network. Contractors act as independent
            data controllers once they receive a customer’s details and are required,
            under our terms, to use those details solely to respond to the specific
            enquiry.
          </p>

          <h2>Contractor data</h2>
          <p>
            If you register as a contractor, we hold your business name, contact
            name, email, phone, base postcode, the services and counties you select,
            and your bidding history. This is visible to our administrators and used
            to match you to jobs. Your business details are not shared with customers
            except where you win a job and choose to make contact.
          </p>

          <h2>Retention</h2>
          <p>
            We keep customer enquiry data for as long as needed to arrange the work
            and to meet our legal and accounting obligations, then delete it.
            Contractor account data is kept for as long as your account is active and
            for a reasonable period afterwards for audit purposes.
          </p>

          <h2>Your rights</h2>
          <p>
            You have the right to access, correct, or request deletion of your
            personal data, and to object to processing. Contact us to exercise these
            rights.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
