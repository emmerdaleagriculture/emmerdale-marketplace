import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { membershipOf } from '@/lib/membership';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminEmail, nonContractorPath } from '@/lib/auth';
import { isAppRequest } from '@/lib/appMode.server';
import { TenderCard, type TenderRow } from './TenderCard';
import a from '../../auth.module.css';
import m from '../market/market.module.css';
import s from './tenders.module.css';

export const metadata: Metadata = {
  title: 'Council tenders',
  robots: { index: false, follow: false },
};

const by = (k: 'action_by' | 'deadline') => (x: TenderRow, y: TenderRow) =>
  (x[k] ? Date.parse(x[k]!) : Infinity) - (y[k] ? Date.parse(y[k]!) : Infinity);

/**
 * An Open member's council tenders: public-sector land contracts on their
 * patch, from Contracts Finder and Find a Tender, gathered daily by
 * /api/cron/tender-watch. Live tenders first (by deadline), then contracts
 * coming up for renewal (by when to approach the buyer), then the ones the
 * member marked "Not for me". Opening the page marks everything seen.
 */
export default async function TendersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/tenders');

  const [{ data: contractor }, { data: sub }] = await Promise.all([
    supabase
      .from('contractors')
      .select('id, business_name, status, premium_comped_until, open_comped_until, tenders_enabled')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status, plan, tier, current_period_end, cancel_at_period_end')
      .eq('contractor_id', user.id)
      .maybeSingle(),
  ]);
  if (!contractor && isAdminEmail(user.email)) redirect('/admin');
  if (!contractor) redirect(await nonContractorPath(user.id));

  const membership = membershipOf(sub, contractor);
  const isOpen = membership === 'open' && contractor.status === 'approved';
  const app = await isAppRequest();
  // Store rules: the app never sells membership, so a non-member there goes home.
  if (app && !isOpen) redirect('/account');

  let rows: TenderRow[] = [];
  let failed = false;
  if (isOpen && contractor.tenders_enabled) {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('sq_tenders_for', { p_contractor_id: user.id });
    if (error) {
      failed = true;
      console.error('sq_tenders_for failed', { contractor: user.id, error: error.message });
    }
    rows = (data ?? []) as TenderRow[];
    // Seen now. The "New" tags below were computed before this write, so
    // they show on this visit and clear on the next.
    if (rows.length) {
      const now = new Date().toISOString();
      const { error: seenErr } = await admin.from('contractor_tenders').upsert(
        rows.map((r) => ({ contractor_id: user.id, tender_id: r.id, seen_at: now, status: r.status, notes: r.notes })),
        { onConflict: 'contractor_id,tender_id' },
      );
      if (seenErr) console.error('tender seen stamp failed', { contractor: user.id, error: seenErr.message });
    }
  }

  const notForMe = rows.filter((r) => r.status === 'no_bid');
  const mine = rows.filter((r) => r.status !== 'no_bid');
  const live = mine.filter((r) => r.kind !== 'renewal').sort(by('deadline'));
  const renewals = mine.filter((r) => r.kind === 'renewal').sort(by('action_by'));
  const fresh = live.filter((r) => r.is_new).length;

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Council tenders' }]}
          />
          <div className={a.eyebrow}>{contractor.business_name}</div>
          <h1 className={a.title}>Council tenders</h1>

          {!isOpen ? (
            <>
              <p className={m.lead}>
                <b>Open members see the council work on their patch.</b> Grass cutting, verges,
                hedges, ditches, rights of way and grounds maintenance contracts from parish,
                district and county councils, gathered every morning from Contracts Finder and
                Find a Tender, and the running contracts coming up for renewal, so you can
                approach the buyer before they re-let.
              </p>
              <div className={m.pitch}>
                <h2>Part of Open membership</h2>
                <p>
                  Open is £49 a month or £399 a year, and includes first look at every new job,
                  the customer’s contact details on every invitation, market data and council
                  tenders for your area.
                </p>
                <Link href="/account/membership">See the membership tiers →</Link>
              </div>
            </>
          ) : !contractor.tenders_enabled ? (
            <div className={m.pitch}>
              <h2>Council tenders are turned off</h2>
              <p>Turn them back on in your settings to see the council contracts on your patch.</p>
              <Link href="/account#settings">Go to your settings →</Link>
            </div>
          ) : failed ? (
            <p className={m.lead}>The tenders aren’t available just now. Please try again in a few minutes.</p>
          ) : (
            <>
              <p className={m.lead}>
                Public contracts for land work in the counties you cover, within reach of your
                base, checked every morning.{' '}
                {fresh > 0 ? (
                  <b>
                    {fresh} new since your last visit.
                  </b>
                ) : null}
              </p>

              <h2 className={m.h2}>Open tenders and early notices</h2>
              <p className={m.sub}>
                Live now, soonest deadline first. The documents and the bid itself are on the
                buyer’s own portal: open the notice to get there.
              </p>
              {live.length === 0 ? (
                <p className={s.empty}>Nothing open on your patch right now. New notices land here each morning.</p>
              ) : (
                <div className={s.list}>
                  {live.map((t) => (
                    <TenderCard key={t.id} t={t} />
                  ))}
                </div>
              )}

              <h2 className={m.h2}>Coming up for renewal</h2>
              <p className={m.sub}>
                Contracts already let and still running. The date to approach the buyer is four
                months before the contract ends, ahead of the re-tender. When one is re-let it
                moves up to the open list and shows as new.
              </p>
              {renewals.length === 0 ? (
                <p className={s.empty}>No running contracts found on your patch yet.</p>
              ) : (
                <div className={s.list}>
                  {renewals.map((t) => (
                    <TenderCard key={t.id} t={t} />
                  ))}
                </div>
              )}

              {notForMe.length > 0 && (
                <details className={s.hidden}>
                  <summary>Not for me ({notForMe.length})</summary>
                  <div className={s.list}>
                    {notForMe.map((t) => (
                      <TenderCard key={t.id} t={t} />
                    ))}
                  </div>
                </details>
              )}

              <p className={m.fine}>
                From Contracts Finder and Find a Tender, matched on the words and contract codes
                for land work. Councils don’t have to publish quotes below the Contracts Finder
                threshold, so many small parish contracts never appear here. Place is where the
                notice puts the work or, failing that, the buyer’s own address.
              </p>
            </>
          )}

          <p className={m.back}>
            <Link href="/account">← Back to your dashboard</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
