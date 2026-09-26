import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getInvitationByToken } from '@/lib/sealedQuotes/data';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ContactUsButton } from '@/components/ContactUsButton';
import { PassPanel } from './PassPanel';
import a from '../../../auth.module.css';
import q from '../quote.module.css';

export const metadata: Metadata = {
  title: 'Passed on this job',
  robots: { index: false, follow: false },
};

// The token is the auth, and arriving is the action.
export const dynamic = 'force-dynamic';

/**
 * The one-tap pass from the invitation email. The invitation carries the
 * whole spec, so a contractor who has read it and thought "not for me" has
 * everything they need to decide — what they lacked was anything to tap
 * that was not "open the job". Recording on arrival is what makes it one
 * tap; the undo below is what makes that safe.
 *
 * The reason is 'not_interested' until they say otherwise: the email cannot
 * ask, and a wrong guess ("too far") would poison the numbers that decide
 * the invitation radius.
 */
export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  if (!invitation || !invitation.submission) notFound();

  const js = invitation.submission;
  const service = (js.service as { name: string } | null)?.name ?? 'Land work';
  const county = (js.county as { name: string } | null)?.name ?? null;
  const location = js.postcode ? js.postcode.split(' ')[0] : null;

  let status = invitation.status;
  let reason = invitation.decline_reason;
  if (status === 'sent' || status === 'viewed') {
    const { data, error } = await createServiceRoleClient().rpc('decline_invitation', {
      p_token: token,
      p_reason: 'not_interested',
    });
    if (error) console.error('[sq] pass link decline failed:', error);
    const res = data as { ok: boolean; reason?: string } | null;
    if (res?.ok) {
      status = 'declined';
      reason = 'not_interested';
    } else if (res?.reason === 'closed') {
      status = 'closed_stale';
    }
  }

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

          {status === 'declined' && (
            <>
              <div className={q.closedPanel}>
                <strong>Passed — thanks for the quick answer.</strong> We won&rsquo;t chase
                you about this job again. Nothing else is needed from you.
              </div>
              <PassPanel token={token} reason={reason} />
            </>
          )}

          {status === 'priced' && (
            <div className={q.pricedPanel}>
              <strong>You&rsquo;ve already priced this job</strong>, so nothing was changed.
              A pass now would withdraw your price, which needs a word with us first.{' '}
              <a href={`/quote/${token}`}>Back to your price</a>.
            </div>
          )}

          {(status === 'closed_awarded' || status === 'closed_stale') && (
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
