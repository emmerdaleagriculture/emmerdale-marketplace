import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import { CancelRepeat, RepeatSetup, SwitchRepeatMode } from './RepeatControls';
import { startReorderAction } from './actions';
import { ContactUsButton } from '@/components/ContactUsButton';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export const metadata: Metadata = { title: 'Your jobs', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const DONE = new Set(['completed', 'paid']);
const LIVE = new Set([
  'confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment',
  'awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor',
]);

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Just sent',
  distributed: 'Out to contractors',
  quotes_receiving: 'Prices coming in',
  accepted_awaiting_payment: 'Waiting for your deposit',
  awarded: 'Booked',
  contacted: 'Contractor in touch',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Awaiting your confirmation',
  completed: 'Done',
  paid: 'Done — paid in full',
  no_matches: 'No contractors covered it',
  no_quotes: 'Nobody priced it',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/**
 * The customer's account: every job they've had, and the two things they'd
 * want from a second one — order it again, or have it go out on its own.
 * Either way they choose who gets it: the contractor who did it last time
 * (asked first, others after 48 hours if they can't), or fresh prices from
 * everyone who covers the area.
 *
 * A job arrives here by being claimed from its own link, never by matching an
 * email address; see the migration for why. Someone with no claimed job has no
 * account to show, so they're sent to the link they already hold.
 */
export default async function MyJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my');

  const admin = createServiceRoleClient();
  const [jobsQ, schedulesQ] = await Promise.all([
    admin
      .from('job_submissions')
      .select('id, status, created_at, postcode, service_verbatim, raw_text, client_token, awarded_contractor_id, service:services(name), county:counties(name)')
      .eq('customer_id', user.id)
      // A repeat the customer started and backed out of is a draft they never
      // sent. It is not one of their jobs and has nothing to show.
      .not('status', 'in', '(draft,abandoned)')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('job_schedules')
      .select('id, source_submission_id, interval_months, next_run_at, runs, active, contractor_mode, contractor_id')
      .eq('customer_id', user.id)
      .eq('active', true),
  ]);

  const jobs = jobsQ.data ?? [];
  const schedules = schedulesQ.data ?? [];
  const scheduleFor = new Map(schedules.map((s) => [s.source_submission_id, s]));

  // Contractors are named to the customer once they've done the work for
  // them — the name is how they choose "the same one again".
  const contractorIds = [
    ...new Set(
      [...jobs.map((j) => j.awarded_contractor_id), ...schedules.map((s) => s.contractor_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const { data: contractors } = contractorIds.length
    ? await admin.from('contractors').select('id, business_name').in('id', contractorIds)
    : { data: [] as { id: string; business_name: string }[] };
  const nameOf = new Map((contractors ?? []).map((c) => [c.id, c.business_name]));

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>Your account</div>
          <h1 className={a.title}>Your jobs</h1>

          {jobs.length === 0 ? (
            <p className={a.sub}>
              Nothing here yet. Open the link we emailed you for a job and choose{' '}
              <strong>Save to my account</strong> — that job and any others at the same
              address will appear here.
            </p>
          ) : (
            <>
              <p className={a.sub}>
                Everything you&rsquo;ve had done, and everything on its way. A job you&rsquo;ve
                had before can go out again in a couple of taps — to the same contractor or
                for fresh prices — or on its own, as often as you need it.
              </p>

              <div style={{ display: 'grid', gap: 18 }}>
                {jobs.map((j) => {
                  const label = STATUS_LABEL[j.status] ?? j.status;
                  const service = (j.service as { name: string } | null)?.name;
                  const county = (j.county as { name: string } | null)?.name;
                  const repeat = scheduleFor.get(j.id);
                  const contractorName = j.awarded_contractor_id ? nameOf.get(j.awarded_contractor_id) ?? null : null;
                  const repeatContractor = repeat?.contractor_id ? nameOf.get(repeat.contractor_id) ?? null : null;
                  const repeatMode = repeat?.contractor_mode === 'same' ? 'same' : 'market';
                  return (
                    <div key={j.id} className={a.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <strong>{service ?? j.service_verbatim ?? j.raw_text ?? 'Job'}</strong>
                        <span>{label}</span>
                      </div>
                      <p className={a.sub} style={{ margin: '6px 0 14px' }}>
                        {[j.postcode, county].filter(Boolean).join(', ') || 'Location not set'} ·{' '}
                        {formatDateTime(j.created_at)}
                        {contractorName && ` · done by ${contractorName}`}
                        {j.client_token && (
                          <>
                            {' · '}
                            <Link href={`/my/${j.client_token}`}>Open this job</Link>
                          </>
                        )}
                      </p>

                      {DONE.has(j.status) && (
                        <div style={{ display: 'grid', gap: 12 }}>
                          {contractorName ? (
                            <>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <form action={startReorderAction}>
                                  <input type="hidden" name="submission_id" value={j.id} />
                                  <input type="hidden" name="mode" value="same" />
                                  <button className={f.btnPrimary} type="submit">
                                    Book {contractorName} again
                                  </button>
                                </form>
                                <form action={startReorderAction}>
                                  <input type="hidden" name="submission_id" value={j.id} />
                                  <input type="hidden" name="mode" value="market" />
                                  <button className={f.btnGhost} type="submit">
                                    Get fresh prices
                                  </button>
                                </form>
                              </div>
                              <p className={f.hint} style={{ margin: 0 }}>
                                Booking again asks {contractorName} first — if they can&rsquo;t
                                price it within 48 hours, it goes to other contractors. Fresh
                                prices sends it to every contractor who covers{' '}
                                {county ?? 'your area'}.
                              </p>
                            </>
                          ) : (
                            <form action={startReorderAction}>
                              <input type="hidden" name="submission_id" value={j.id} />
                              <input type="hidden" name="mode" value="market" />
                              <button className={f.btnPrimary} type="submit">
                                Order it again
                              </button>
                            </form>
                          )}
                          {repeat ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <span>
                                Repeating every {repeat.interval_months} months — next one{' '}
                                {formatDateTime(repeat.next_run_at)}
                                {' · '}
                                {repeatMode === 'same' && repeatContractor
                                  ? `asks ${repeatContractor} first`
                                  : 'fresh prices each time'}
                                {repeat.runs > 0 ? ` · sent ${repeat.runs} time${repeat.runs === 1 ? '' : 's'} so far` : ''}
                              </span>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <SwitchRepeatMode
                                  scheduleId={repeat.id}
                                  mode={repeatMode}
                                  contractorName={repeatContractor}
                                />
                                <CancelRepeat scheduleId={repeat.id} />
                              </div>
                            </div>
                          ) : (
                            <RepeatSetup submissionId={j.id} contractorName={contractorName} />
                          )}
                        </div>
                      )}

                      {LIVE.has(j.status) && (
                        <p className={a.sub} style={{ margin: 0 }}>
                          You can order this one again once it&rsquo;s finished.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <ContactUsButton
            subject="Customer enquiry"
            body={`\n\n—\nSent from my account (${user.email ?? ''})`}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
