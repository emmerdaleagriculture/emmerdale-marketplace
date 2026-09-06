import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  COMPANY_ADDRESS_LINES,
  COMPANY_LEGAL_NAME,
  COMPANY_REG_LINE,
  CONTACT_EMAIL,
} from '@/lib/site';
import a from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'Get in touch with Emmerdale Agriculture — email us about a job, an invoice or anything that has gone wrong.',
  alternates: { canonical: '/contact' },
};

/**
 * A page rather than a mailto in the footer.
 *
 * "Contact us" that fires a mail client is a dead end for anyone without one
 * configured, and it answers none of the questions a person actually has when
 * they go looking for it: who are these people, where are they, and is this
 * the right way to reach them about my particular thing. Those are three
 * different routes, so the page names all three.
 */
export default function ContactPage() {
  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Emmerdale Agriculture</div>
          <h1 className={a.title}>Contact us</h1>
          <p className={a.sub}>
            A real person reads these. If it&rsquo;s about a job that&rsquo;s already
            running, say which one and we&rsquo;ll find it.
          </p>

          <div className={a.card}>
            <h2 className={a.cardTitle}>Email</h2>
            <p>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
            <p className={a.altLink}>
              Contractors: for anything about an invitation, a price you&rsquo;ve
              given or an invoice, email us here or reply to any email we&rsquo;ve
              sent you — replies reach the same place.
            </p>
          </div>

          <div className={a.card} style={{ marginTop: 20 }}>
            <h2 className={a.cardTitle}>Want work quoted?</h2>
            <p>
              Don&rsquo;t email it — <Link href="/start">describe the job</Link> and
              it goes straight out to contractors covering your area, with prices
              back to you rather than a conversation first.
            </p>
          </div>

          <div className={a.card} style={{ marginTop: 20 }}>
            <h2 className={a.cardTitle}>Post</h2>
            <p>
              {COMPANY_LEGAL_NAME}
              <br />
              {COMPANY_ADDRESS_LINES.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
            <p className={a.altLink}>{COMPANY_REG_LINE}</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
