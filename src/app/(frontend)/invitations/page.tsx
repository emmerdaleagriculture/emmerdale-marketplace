import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatDateTime, timeLeft } from '@/lib/time';
import a from '../auth.module.css';
import s from './invitations.module.css';

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
  if (!contractor) redirect('/onboarding');

  const { data } = await supabase
    .from('my_sq_invitations')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(100);
  const invitations = data ?? [];
  const open = invitations.filter(
    (i) => i.job_state === 'open' && ['sent', 'viewed', 'priced'].includes(i.status ?? ''),
  );
  const history = invitations.filter((i) => !open.includes(i));

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>The network</div>
          <h1 className={a.title}>Jobs to price</h1>
          <p className={a.sub}>
            First come, first served: the customer sees prices as they arrive and can
            accept at any moment — pricing promptly matters.
          </p>

          {contractor.status !== 'approved' ? (
            <div className={s.gate}>
              Your account is awaiting approval — invitations will appear here once
              you&rsquo;re approved.
            </div>
          ) : (
            <>
              {open.length === 0 ? (
                <div className={s.empty}>
                  Nothing to price right now. You&rsquo;ll get an email the moment a
                  matching job comes in.
                </div>
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
                        <span className={s.service}>{inv.service ?? 'Land work'}</span>
                        {inv.status === 'priced' ? (
                          <span className={s.pillPriced}>Priced</span>
                        ) : (
                          <span className={s.pillOpen}>Not priced yet</span>
                        )}
                      </div>
                      <div className={s.meta}>
                        {[inv.postcode_district, inv.county].filter(Boolean).join(', ')}
                        {inv.distance_miles != null && ` · ${inv.distance_miles} miles`}
                      </div>
                      <div className={s.meta}>
                        {inv.area_mapped_value
                          ? `${inv.area_mapped_value} acres (measured)`
                          : inv.area_value
                            ? `${inv.area_value} ${inv.area_unit === 'linear_m' ? 'm' : inv.area_unit}`
                            : ''}
                      </div>
                      <div className={s.deadline}>
                        {inv.expires_at ? timeLeft(inv.expires_at) : ''}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {history.length > 0 && (
                <>
                  <div className={a.groupTitle} style={{ marginTop: 32 }}>
                    Past invitations
                  </div>
                  <div className={s.historyList}>
                    {history.map((inv) => (
                      <div key={inv.id} className={s.historyRow}>
                        <span>{inv.service ?? 'Land work'}</span>
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
                </>
              )}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
