import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getInvitationByToken } from '@/lib/sealedQuotes/data';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ContactUsButton } from '@/components/ContactUsButton';
import { PassPanel } from './PassPanel';
import a from '../../../auth.module.css';
import q from '../quote.module.css';

export const metadata: Metadata = {
  title: 'Pass on this job',
  robots: { index: false, follow: false },
};

// The token is the auth — every load is a live lookup.
export const dynamic = 'force-dynamic';

/**
 * Where the invitation email's "not one for you?" link lands. The invitation
 * carries the whole spec, so a contractor who has read it has everything they
 * need to decide; what they lacked was anything to tap that was not "open
 * the job". This page is that: the reason chips and nothing else.
 *
 * Arriving records nothing (see PassPanel for why), so a GET here is always
 * safe and the page never has to explain a write that failed.
 */
export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  if (!invitation || !invitation.submission) notFound();

  const js = invitation.submission;
  const service = (js.service as { name: string } | null)?.name ?? js.service_verbatim ?? 'Land work';
  const county = (js.county as { name: string } | null)?.name ?? null;
  const location = js.postcode ? js.postcode.split(' ')[0] : null;

  const jobOpen = ['distributed', 'quotes_receiving'].includes(js.status);
  const status = invitation.status;

  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Job to price</div>
          <h1 className={a.title}>{service}</h1>
          <p className={a.sub}>
            {location ? `${location}, ` : ''}
            {county ?? ''}
          </p>

          {jobOpen && (status === 'sent' || status === 'viewed' || status === 'declined') && (
            <PassPanel token={token} declined={status === 'declined'} />
          )}

          {status === 'priced' && (
            <div className={q.pricedPanel}>
              <strong>You&rsquo;ve already priced this job.</strong> A pass now would withdraw
              your price, which needs a word with us first.{' '}
              <a href={`/quote/${token}`}>Back to your price</a>.
            </div>
          )}

          {(!jobOpen || status === 'closed_awarded' || status === 'closed_stale') &&
            status !== 'priced' && (
              <div className={q.closedPanel}>
                This job has already closed, so there is nothing to pass on. No action needed.
              </div>
            )}

          <ContactUsButton
            subject={`About a job to price — ${service}${location ? `, ${location}` : ''} (ref ${js.id.slice(0, 8)})`}
            note="A question about this job?"
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
