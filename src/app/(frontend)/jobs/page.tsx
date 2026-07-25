import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { createClient } from '@/lib/supabase/server';
import { getServices } from '@/lib/reference';
import { timeAgo } from '@/lib/time';
import a from '../auth.module.css';
import j from './jobs.module.css';

export const metadata: Metadata = { title: 'Jobs' };

/** "Winchester, SO23 · Hampshire" — any of town/district may be missing. */
function jobLocation(job: { town?: string | null; postcode_district?: string | null; county?: string | null }) {
  const place = [job.town, job.postcode_district].filter(Boolean).join(', ');
  return [place, job.county].filter(Boolean).join(' · ');
}

export default async function JobsBoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/jobs');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status, business_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect('/onboarding');

  const services = await getServices();
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  const gated = contractor.status !== 'approved';

  const [{ data: liveJobs }, { data: openedJobs }] = gated
    ? [{ data: [] as never[] }, { data: [] as never[] }]
    : await Promise.all([
        supabase.from('public_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('my_opened_jobs').select('*').order('opened_at', { ascending: false }),
      ]);

  // Jobs the contractor has already opened live under "Jobs you've opened";
  // the top list is what's new to them.
  const newJobs = (liveJobs ?? []).filter((job) => !job.opened_at);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>The network</div>
          <h1 className={a.title}>Open jobs</h1>

          {gated ? (
            <div className={j.gate}>
              {contractor.status === 'pending'
                ? 'Your application is still under review. You’ll see jobs here once you’re approved.'
                : 'Your account is suspended, so the job board is unavailable. Get in touch if you think this is a mistake.'}
            </div>
          ) : (
            <>
              <p className={a.sub}>
                Jobs in the counties you cover. Open one to see the full details and
                the customer’s contact — then get in touch directly. The customer
                chooses who they hire, so a quick call goes a long way.
              </p>

              {newJobs.length === 0 ? (
                <div className={j.gate} style={{ background: 'var(--cream)', borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
                  No new jobs in your counties right now. We’ll email you when one
                  comes up.
                </div>
              ) : (
                <div className={j.grid}>
                  {newJobs.map((job) => (
                    // prefetch={false}: opening a job page reveals the customer's
                    // contact and logs who viewed it — that must only happen on a
                    // real click, never a hover/viewport prefetch.
                    <Link key={job.id} href={`/jobs/${job.id}`} prefetch={false} className={j.card}>
                      <div className={j.cardTop}>
                        <span className={j.cardTitle}>{job.title}</span>
                        <span className={j.closes}>posted {timeAgo(job.created_at!)}</span>
                      </div>
                      <div className={j.meta}>
                        {job.customer_first_name ? `For ${job.customer_first_name} · ` : ''}
                        {jobLocation(job)}
                      </div>
                      <div className={j.tags}>
                        {(job.service_ids ?? []).slice(0, 4).map((sid) => (
                          <span key={sid} className={j.tag}>
                            {serviceName.get(sid) ?? sid}
                          </span>
                        ))}
                      </div>
                      {job.budget_hint && <div className={j.meta}>Budget: {job.budget_hint}</div>}
                      <div className={j.cardFoot}>
                        <span>Open for details &amp; contact</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {(openedJobs ?? []).length > 0 && (
                <>
                  <div className={a.groupTitle}>Jobs you’ve opened</div>
                  <p className={a.sub}>
                    You’ve seen the customer’s details for these — get in touch if
                    you haven’t already.
                  </p>
                  <div className={j.grid}>
                    {(openedJobs ?? []).map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`} prefetch={false} className={j.card}>
                        <div className={j.cardTop}>
                          <span className={j.cardTitle}>{job.title}</span>
                          <span className={j.closes}>
                            {job.status === 'completed'
                              ? 'filled'
                              : job.status === 'withdrawn'
                                ? 'withdrawn'
                                : `opened ${timeAgo(job.opened_at!)}`}
                          </span>
                        </div>
                        <div className={j.meta}>{jobLocation(job)}</div>
                        <div className={j.cardFoot}>
                          <span>Contact details available</span>
                        </div>
                      </Link>
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
