import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { jobAcres } from '@/lib/jobParse/geometry';
import { ContactUsButton } from '@/components/ContactUsButton';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatDate, formatDateTime, timeAgo, timeLeft } from '@/lib/time';
import { URGENCY_LABELS } from '@/components/job/JobSpecCard';
import { gateWidthLabel } from '@/lib/jobParse/access';
import { formatGBP, formatRate } from '@/lib/sealedQuotes/money';
import a from '../auth.module.css';
import { Breadcrumb } from '@/components/Breadcrumb';
import s from './invitations.module.css';
import { AppFold } from '@/components/app/AppFold';
import { isAppRequest } from '@/lib/appMode.server';

/** Unclassified jobs carry the customer's own words as the title — keep a card a card. */
function clip(text: string, n: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

type Invitation = NonNullable<Awaited<ReturnType<typeof loadInvitations>>>[number];
type LiveQuote = {
  quote_type: string | null;
  contractor_price_pence: number | null;
  rate_value_pence: number | null;
  rate_minimum_pence: number | null;
};

async function loadInvitations(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('my_sq_invitations')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(100);
  return data;
}

/** "3 acres · measured" or "3 acres · est." — whose figure it is matters to a price. */
function areaLine(inv: Invitation): string {
  const acres = jobAcres(inv);
  if (acres !== null && inv.area_unit !== 'linear_m') {
    const measured = inv.area_source !== 'stated' && inv.area_mapped_value != null;
    return `${acres} acres · ${measured ? 'measured' : 'est.'}`;
  }
  if (inv.area_value) {
    return `${inv.area_value} ${inv.area_unit === 'linear_m' ? 'm' : inv.area_unit} · est.`;
  }
  return '';
}

/** When the customer wants it done, in a few words. */
function whenLine(inv: Invitation): string | null {
  if (inv.target_date) return `Wanted by ${formatDate(inv.target_date)}`;
  if (!inv.urgency || inv.urgency === 'dated') return null;
  return inv.urgency === 'asap' ? 'Wanted ASAP' : `Wanted: ${URGENCY_LABELS[inv.urgency]?.toLowerCase()}`;
}

/**
 * The deadline line, and whether it is close enough to colour. The window a
 * job is held alone comes first; otherwise the date it stops taking prices,
 * stated as a date — "69 days left" read as "no rush" on a first-come list.
 */
function deadline(inv: Invitation): { text: string; urgent: boolean } | null {
  const now = Date.now();
  const soon = (iso: string) => new Date(iso).getTime() - now < 48 * 3600_000;
  if (inv.offered_until && new Date(inv.offered_until).getTime() > now) {
    const who = inv.premium_offer ? 'Premium first look' : 'Yours alone';
    return { text: `${who} until ${formatDateTime(inv.offered_until)}`, urgent: soon(inv.offered_until) };
  }
  if (inv.offered_until && !inv.premium_offer) return { text: 'Yours alone', urgent: false };
  if (!inv.expires_at) return null;
  if (!soon(inv.expires_at)) return { text: `Taking prices until ${formatDate(inv.expires_at)}`, urgent: false };
  // timeLeft: "5h left", "1 day left", "closes within the hour", "closed".
  const left = timeLeft(inv.expires_at);
  const text = left.endsWith(' left')
    ? `Closes in ${left.slice(0, -' left'.length)}`
    : left === 'closed'
      ? 'Closed'
      : 'Closes within the hour';
  return { text, urgent: true };
}

function priceLabel(q: LiveQuote): string | null {
  if (q.quote_type === 'rate' && q.rate_value_pence) return formatRate(q.rate_value_pence, q.rate_minimum_pence);
  return q.contractor_price_pence != null ? formatGBP(q.contractor_price_pence) : null;
}

/** The app's card: what a contractor decides on, without opening it. */
function AppCard({ inv, price }: { inv: Invitation; price: string | null }) {
  const priced = inv.status === 'priced';
  const when = whenLine(inv);
  const gate = gateWidthLabel(inv.gate_width ?? null);
  const dl = deadline(inv);
  const place = [inv.postcode_district, inv.county].filter(Boolean).join(', ');
  return (
    <Link href={`/quote/${inv.token}`} prefetch={false} className={`${s.card} ${s.appCard}`}>
      <div className={s.appHead}>
        <span className={s.appService}>{clip(inv.service ?? 'Land work', 70)}</span>
        <svg className={s.chevron} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {(inv.also_services?.length ?? 0) > 0 && (
        <div className={s.meta}>Also wanted: {inv.also_services!.join(', ')}</div>
      )}
      <div className={s.meta}>
        {[place, inv.distance_miles != null ? `${Math.round(Number(inv.distance_miles))} mi` : null, areaLine(inv) || null]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {(when || gate) && (
        <div className={s.meta}>{[when, gate ? `Access: ${gate.charAt(0).toLowerCase()}${gate.slice(1)}` : null].filter(Boolean).join(' · ')}</div>
      )}
      <div className={s.appFoot}>
        <div className={s.appTimes}>
          {inv.sent_at && <span>Sent {timeAgo(inv.sent_at)}</span>}
          {dl && <span className={dl.urgent ? s.dueSoon : undefined}>{dl.text}</span>}
        </div>
        {priced ? (
          <span className={s.yourPrice}>
            {price ? <>Your price <strong>{price}</strong></> : 'Priced'}
          </span>
        ) : (
          <span className={s.priceCta}>Price this job</span>
        )}
      </div>
    </Link>
  );
}

export const metadata: Metadata = {
  title: 'Invitations',
  robots: { index: false, follow: false },
};

/**
 * Contractor portal: jobs to price (§19). Every row deep-links into the
 * tokenised price page — one write path. Queries go through the RLS-backed
 * my_sq_invitations view: a contractor can structurally only see their own.
 */
export default async function InvitationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/invitations');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect(await nonContractorPath(user.id));

  const invitations = (await loadInvitations(supabase)) ?? [];
  const open = invitations.filter(
    (i) => i.job_state === 'open' && ['sent', 'viewed', 'priced'].includes(i.status ?? ''),
  );
  const history = invitations.filter((i) => !open.includes(i));
  // In the app the past list folds into a closed drawer (AppFold) so the
  // invitations still waiting on an answer stay on the first screen.
  const inApp = await isAppRequest();

  // App only: jobs still to price first, then the priced ones with the
  // contractor's own current price on the card (RLS: their quotes only).
  const toPrice = open.filter((i) => i.status !== 'priced');
  const priced = open.filter((i) => i.status === 'priced');
  const prices = new Map<string, string | null>();
  if (inApp && priced.length > 0) {
    const { data: quotes } = await supabase
      .from('contractor_quotes')
      .select('submission_id, quote_type, contractor_price_pence, rate_value_pence, rate_minimum_pence, created_at')
      .eq('contractor_id', user.id)
      .in('submission_id', priced.map((i) => i.submission_id!))
      .is('superseded_by', null)
      .order('created_at', { ascending: false });
    for (const q of quotes ?? []) {
      if (!prices.has(q.submission_id)) prices.set(q.submission_id, priceLabel(q));
    }
  }

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Jobs to price' }]}
          />
          <div className={a.eyebrow} data-app-hide>The network</div>
          <h1 className={`${a.title} ${s.appTitle}`}>Jobs to price</h1>
          {inApp ? (
            <p className={s.appSub}>Customers can accept the first good price. Price early.</p>
          ) : (
            <p className={a.sub}>
              First come, first served: the customer sees prices as they arrive and can
              accept at any moment. Pricing promptly matters.
            </p>
          )}

          {contractor.status !== 'approved' ? (
            <div className={s.gate}>
              Your account is awaiting approval. Invitations will appear here once
              you&rsquo;re approved.
            </div>
          ) : (
            <>
              {open.length === 0 ? (
                <div className={s.empty}>
                  Nothing to price right now. You&rsquo;ll get an email the moment a
                  matching job comes in.
                </div>
              ) : inApp ? (
                <>
                  {toPrice.length > 0 && (
                    <>
                      <h2 className={s.appSection}>To price ({toPrice.length})</h2>
                      <div className={s.appList}>
                        {toPrice.map((inv) => (
                          <AppCard key={inv.id} inv={inv} price={null} />
                        ))}
                      </div>
                    </>
                  )}
                  {priced.length > 0 && (
                    <>
                      <h2 className={s.appSection}>Priced ({priced.length})</h2>
                      <div className={s.appList}>
                        {priced.map((inv) => (
                          <AppCard key={inv.id} inv={inv} price={prices.get(inv.submission_id!) ?? null} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className={s.grid}>
                  {open.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/quote/${inv.token}`}
                      prefetch={false}
                      className={s.card}
                    >
                      <div className={s.cardHead}>
                        <span className={s.service}>{clip(inv.service ?? 'Land work', 70)}</span>
                        {inv.status === 'priced' ? (
                          <span className={s.pillPriced}>Priced</span>
                        ) : (
                          <span className={s.pillOpen}>Not priced yet</span>
                        )}
                      </div>
                      {(inv.also_services?.length ?? 0) > 0 && (
                        <div className={s.meta}>Also wanted: {inv.also_services!.join(', ')}</div>
                      )}
                      <div className={s.meta}>
                        {[inv.postcode_district, inv.county].filter(Boolean).join(', ')}
                        {inv.distance_miles != null && ` · ${inv.distance_miles} miles`}
                      </div>
                      <div className={s.meta}>
                        {jobAcres(inv) !== null && inv.area_unit !== 'linear_m'
                          ? `${jobAcres(inv)} acres${inv.area_source === 'stated' || inv.area_mapped_value == null ? '' : ' (measured)'}`
                          : inv.area_value
                            ? `${inv.area_value} ${inv.area_unit === 'linear_m' ? 'm' : inv.area_unit}`
                            : ''}
                      </div>
                      {/* Held alone (first refusal or a direct repeat): the
                          deadline that matters is when it opens to others.
                          Past it and still held means they priced in time and
                          keep it — no other contractor is coming. */}
                      <div className={s.deadline}>
                        {inv.offered_until && inv.premium_offer
                          ? new Date(inv.offered_until) > new Date()
                            ? `Premium first look until ${formatDateTime(inv.offered_until)}`
                            : inv.expires_at
                              ? timeLeft(inv.expires_at)
                              : ''
                          : inv.offered_until
                          ? new Date(inv.offered_until) > new Date()
                            ? `Yours alone until ${formatDateTime(inv.offered_until)}`
                            : 'Yours alone'
                          : inv.expires_at
                            ? timeLeft(inv.expires_at)
                            : ''}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {history.length > 0 && (
                <AppFold inApp={inApp} title="Past invitations" count={history.length} titleStyle={{ marginTop: 32 }}>
                  <div className={s.historyList}>
                    {history.map((inv) => (
                      <div key={inv.id} className={s.historyRow}>
                        <span>{clip(inv.service ?? 'Land work', 50)}</span>
                        <span className={s.meta}>
                          {[inv.postcode_district, inv.county].filter(Boolean).join(', ')}
                        </span>
                        <span className={s.historyStatus}>
                          {inv.status === 'declined'
                            ? `Passed${inv.decline_reason ? ` (${inv.decline_reason.replace(/_/g, ' ')})` : ''}`
                            : inv.status === 'closed_awarded'
                              ? 'Taken by another price'
                              : inv.status === 'closed_stale'
                                ? 'Lapsed'
                                : inv.status}
                        </span>
                        <span className={s.meta}>
                          {inv.sent_at ? formatDateTime(inv.sent_at) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </AppFold>
              )}
            </>
          )}

          <ContactUsButton subject="Contractor enquiry: jobs to price" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
