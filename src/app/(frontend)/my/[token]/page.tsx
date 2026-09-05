import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getClientQuoteById,
  getClientQuotes,
  getCompositeWeight,
  getSubmissionByClientToken,
  signPhotos,
} from '@/lib/sealedQuotes/data';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { MinimalHeader } from '@/components/MinimalHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { JobSpecCard } from '@/components/job/JobSpecCard';
import { StatusTimeline } from './StatusTimeline';
import { PriceList, type ClientQuoteView } from './PriceList';
import { ConfirmDone } from './ConfirmDone';
import { PayNow } from './PayNow';
import { SaveToAccount } from './SaveToAccount';
import { createClient } from '@/lib/supabase/server';
import a from '../../auth.module.css';
import m from './my.module.css';

export const metadata: Metadata = {
  title: 'Your job',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The client portal (§19): the system of record for one job, reached by the
 * emailed magic link. Anonymous, mobile-first — for many clients this is
 * their second-ever interaction with the brand. Renders every status the
 * state machine can produce; language says "price", never "quote".
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const js = await getSubmissionByClientToken(token);
  if (!js) notFound();

  // Who's looking. Signed in and the job unclaimed is the one moment an
  // account can start, because holding this link is the only proof there is.
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  // Shown to signed-out customers too: they are the whole audience for it,
  // and gating on a session made the feature reachable only by people who
  // already had a contractor login.
  const claimable = !js.customer_id;
  const mine = Boolean(user) && js.customer_id === user?.id;

  const service = (js.service as { id: number; name: string } | null)?.name ?? js.service_verbatim;
  const county = (js.county as { name: string } | null)?.name ?? null;
  const first = js.contact_name?.split(/\s+/)[0] ?? 'there';

  // Everything after the token lookup is independent — one round-trip of
  // latency. The accepted quote is fetched by id with no validity filter:
  // an award outlives its quote's valid-until date.
  const needQuotes = ['quotes_receiving', 'accepted_awaiting_payment'].includes(js.status);
  const [quotes, ratingWeight, photos, accepted] = await Promise.all([
    needQuotes ? getClientQuotes(js.id) : Promise.resolve([]),
    needQuotes ? getCompositeWeight() : Promise.resolve(0.3),
    signPhotos(js.photo_paths),
    js.accepted_client_quote_id
      ? getClientQuoteById(js.accepted_client_quote_id)
      : Promise.resolve(null),
  ]);

  const spec = {
    service,
    areaValue: js.area_value,
    areaUnit: js.area_unit,
    areaMapped: js.area_mapped_value,
    urgency: js.urgency,
    targetDate: js.target_date,
    accessNotes: js.access_notes,
    obstacles: js.obstacles,
    gateWidth: js.gate_width,
    gateW3w: js.gate_w3w,
    conditions: (js.service_attributes ?? {}) as Record<string, unknown>,
    location: js.postcode,
    county,
    photos,
  };

  return (
    <div className={a.wrap}>
      <MinimalHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>Your job</div>
          <h1 className={a.title}>{service ?? 'Your job'}</h1>
          <StatusTimeline status={js.status} />

          {/* ── Pre-quotes ─────────────────────────────────────────── */}
          {(js.status === 'confirmed' || js.status === 'distributed') && (
            <p className={a.sub}>
              Hi {first} — we&rsquo;re putting your job in front of contractors who
              cover {county ?? 'your area'}. Prices appear here as they come in, and
              we&rsquo;ll email you when the first one arrives.
            </p>
          )}

          {/* ── Live prices ────────────────────────────────────────── */}
          {js.status === 'quotes_receiving' && (
            <>
              <p className={a.sub}>
                {quotes.length === 1
                  ? 'One price so far — more may follow.'
                  : `${quotes.length} prices to choose from.`}{' '}
                Nothing is booked until you accept one and pay.
              </p>
              <PriceList
                token={token}
                quotes={quotes as ClientQuoteView[]}
                ratingWeight={ratingWeight}
              />
            </>
          )}

          {/* ── Awaiting payment ───────────────────────────────────── */}
          {js.status === 'accepted_awaiting_payment' && accepted && (
            <PayNow
              token={token}
              quoteId={accepted.id}
              label={accepted.contractor_display_label}
              amountLabel={formatGBP(accepted.client_price_pence)}
            />
          )}

          {/* ── Booked ─────────────────────────────────────────────── */}
          {['awarded', 'contacted', 'scheduled', 'in_progress'].includes(js.status) && (
            <div className={m.awardPanel}>
              <p>
                <strong>{accepted?.contractor_real_name ?? 'Your contractor'}</strong> has
                your job{accepted ? ` at ${formatGBP(accepted.client_price_pence)}` : ''}. You&rsquo;ve
                paid in full; we hold the money and release it to them when the
                work&rsquo;s done.
              </p>
              <p>They&rsquo;ll be in touch within 24 hours to arrange it.</p>
            </div>
          )}

          {/* ── Contractor says it's finished ──────────────────────── */}
          {js.status === 'completed_by_contractor' && (
            <ConfirmDone
              token={token}
              contractorName={accepted?.contractor_real_name ?? 'Your contractor'}
            />
          )}

          {claimable && <SaveToAccount token={token} signedIn={Boolean(user)} />}
          {mine && (
            <p className={a.sub}>
              This job is on your account. <Link href="/my">See all your jobs →</Link>
            </p>
          )}

          {/* ── Done ───────────────────────────────────────────────── */}
          {(js.status === 'completed' || js.status === 'paid') && (
            <div className={m.awardPanel}>
              <p>
                All done — {accepted?.contractor_real_name ?? 'your contractor'} has been
                paid.
              </p>
              <p>
                If you&rsquo;ve got 30 seconds:{' '}
                <Link href={`/my/${token}/rate`}>rate how it went</Link> — it helps the
                next customer choose.
              </p>
            </div>
          )}

          {/* ── Terminals ──────────────────────────────────────────── */}
          {js.status === 'no_matches' && (
            <p className={a.sub}>
              We don&rsquo;t currently have contractors covering{' '}
              {county ?? 'your area'} for this kind of work — we&rsquo;re sorry. Coverage
              is growing, and we&rsquo;ll let you know if that changes.
            </p>
          )}
          {js.status === 'no_quotes' && (
            <p className={a.sub}>
              We put your job to contractors in {county ?? 'your area'}, but none priced
              it within the week. That&rsquo;s usually about their diaries, not your job —
              you&rsquo;re welcome to post it again.
            </p>
          )}
          {js.status === 'expired' && (
            <p className={a.sub}>
              The prices on this job have lapsed. You&rsquo;re welcome to post the job
              again whenever suits.
            </p>
          )}
          {js.status === 'cancelled' && <p className={a.sub}>This job was cancelled.</p>}

          <div className={a.groupTitle} style={{ marginTop: 28 }}>
            What you told us
          </div>
          <JobSpecCard spec={spec} />
          <p className={m.fixLine}>
            Something wrong with the details? Reply to your confirmation email and
            we&rsquo;ll fix it.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
