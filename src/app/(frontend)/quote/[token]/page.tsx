import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getInvitationByToken, getLiveQuote, signPhotos } from '@/lib/sealedQuotes/data';
import { formatGBP, formatRate } from '@/lib/sealedQuotes/money';
import { timeLeft, formatDateTime } from '@/lib/time';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { JobSpecCard } from '@/components/job/JobSpecCard';
import { BoundaryPreview } from '@/components/job/BoundaryPreview';
import type { BoundaryPolygon } from '@/lib/jobParse/geometry';
import { QuoteForm } from './QuoteForm';
import { DeclineForm } from './DeclineForm';
import a from '../../auth.module.css';
import q from './quote.module.css';

export const metadata: Metadata = {
  title: 'Price this job',
  robots: { index: false, follow: false },
};

// The token is the auth — every load is a live lookup.
export const dynamic = 'force-dynamic';

/**
 * The contractor price page (§17): reached from the invitation email, no
 * login. Viewing is itself an event (it is what "viewed" means); pricing and
 * declining post to the single RPC write path.
 */
export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  if (!invitation || !invitation.submission) notFound();

  const js = invitation.submission;
  const service = js.service as { id: number; name: string; area_priced: boolean } | null;
  const county = (js.county as { name: string } | null)?.name ?? null;

  // One round-trip of latency, not three: the view event, the live quote and
  // the photo signing are independent.
  const admin = createServiceRoleClient();
  const [, live, photos] = await Promise.all([
    admin
      .rpc('record_invitation_view', { p_token: token })
      .then(() => undefined, (e) => console.error('[sq] record view failed:', e)),
    getLiveQuote(js.id, invitation.contractor_id),
    signPhotos(js.photo_paths),
  ]);
  const jobOpen =
    ['distributed', 'quotes_receiving', 'accepted_awaiting_payment'].includes(js.status) &&
    !['declined', 'closed_awarded', 'closed_stale'].includes(invitation.status);

  const acres =
    js.area_mapped_value ?? (js.area_unit === 'acres' ? js.area_value : null);

  const spec = {
    service: service?.name ?? null,
    areaValue: js.area_value,
    areaUnit: js.area_unit,
    areaMapped: js.area_mapped_value,
    urgency: js.urgency,
    targetDate: js.target_date,
    accessNotes: js.access_notes,
    obstacles: js.obstacles,
    gateWidth: js.gate_width,
    conditions: (js.service_attributes ?? {}) as Record<string, unknown>,
    location: js.postcode ? js.postcode.split(' ')[0] : null,
    county,
    distanceMiles: invitation.distance_miles,
    photos,
  };

  return (
    <div className={a.wrap}>
      {js.lat !== null && <link rel="preconnect" href="https://api.mapbox.com" />}
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Job to price</div>
          <h1 className={a.title}>{service?.name ?? 'Land work'}</h1>
          <p className={a.sub}>
            {spec.location ? `${spec.location}, ` : ''}
            {county ?? ''} · full address comes if you win the job
          </p>

          <JobSpecCard spec={spec} />
          {js.lat !== null && js.lng !== null && (
            <BoundaryPreview
              lat={js.lat}
              lng={js.lng}
              boundary={(js.boundary as BoundaryPolygon | null) ?? null}
            />
          )}

          {invitation.status === 'declined' && (
            <div className={q.closedPanel}>
              You passed on this job
              {invitation.decline_reason ? ` (${invitation.decline_reason.replace(/_/g, ' ')})` : ''}.
              Nothing else is needed from you.
            </div>
          )}

          {invitation.status === 'closed_awarded' && (
            <div className={q.closedPanel}>
              This one&rsquo;s been taken. The customer accepted another price before
              yours came in — it happens with first-come jobs. Nothing else is
              needed from you; we&rsquo;ll be in touch when the next job in your
              area comes up.
            </div>
          )}

          {invitation.status === 'closed_stale' && (
            <div className={q.closedPanel}>
              This job has lapsed — the customer didn&rsquo;t take it forward. No
              action needed.
            </div>
          )}

          {/* The winner: invitation stays 'priced' while the job closes around it. */}
          {!jobOpen &&
            invitation.status === 'priced' &&
            js.awarded_contractor_id === invitation.contractor_id && (
              <div className={q.pricedPanel}>
                <strong>You&rsquo;ve got this job.</strong> The customer accepted your
                price and has paid in full — their details and the next steps are in{' '}
                <a href="/won">your won jobs</a>.
              </div>
            )}

          {!jobOpen &&
            invitation.status === 'priced' &&
            js.awarded_contractor_id !== invitation.contractor_id && (
              <div className={q.closedPanel}>
                This one&rsquo;s closed — the customer accepted another price before
                yours. It happens with first-come jobs; thanks for pricing it.
              </div>
            )}

          {jobOpen && (
            <>
              <div className={q.warnPanel}>
                <strong>First come, first served.</strong> The customer sees prices
                as they arrive and can accept at any moment — this job can be gone
                on day one. Price it within{' '}
                {js.expires_at ? timeLeft(js.expires_at).replace(' left', '') : '7 days'}, but the
                sooner you price, the better your chances.
              </div>

              {live && (
                <div className={q.pricedPanel}>
                  Your current price:{' '}
                  <strong>
                    {live.quote_type === 'rate' && live.rate_value_pence
                      ? formatRate(live.rate_value_pence, live.rate_minimum_pence)
                      : formatGBP(live.contractor_price_pence)}
                  </strong>{' '}
                  (sent {formatDateTime(live.created_at)}, valid until {live.valid_until}).
                  Send a new price below — the latest one is what the customer sees.
                </div>
              )}

              <QuoteForm
                token={token}
                areaPriced={Boolean(service?.area_priced && acres)}
                acres={acres}
                revising={Boolean(live)}
                defaultValidUntil={js.expires_at ? js.expires_at.slice(0, 10) : null}
              />

              {!live && <DeclineForm token={token} />}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
