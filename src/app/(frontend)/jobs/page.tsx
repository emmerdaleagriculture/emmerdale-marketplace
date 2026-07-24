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

export default async function JobsBoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status, business_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect('/onboarding');

  const services = await getServices();
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  const gated = contractor.status !== 'approved';

  const [{ data: openJobs }, { data: myJobs }, { data: recentClaims }] = gated
    ? [{ data: [] as never[] }, { data: [] as never[] }, { data: [] as never[] }]
    : await Promise.all([
        supabase.from('public_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('my_claimed_jobs').select('*').order('claimed_at', { ascending: false }),
        supabase
          .from('recently_claimed_jobs')
          .select('*')
          .order('claimed_at', { ascending: false })
          .limit(12),
      ]);

  // The activity feed is network-wide; a contractor's own claims already appear
  // under "Your jobs".
  const myIds = new Set((myJobs ?? []).map((job) => job.id));
  const claimedFeed = (recentClaims ?? []).filter((job) => !myIds.has(job.id));

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
                Jobs in the counties you cover. First come, first served — claim a
                job and you get the customer’s details to arrange the work directly.
              </p>

              {(openJobs ?? []).length === 0 ? (
                <div className={j.gate} style={{ background: 'var(--cream)', borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
                  No open jobs in your counties right now. We’ll email you when one
                  comes up.
                </div>
              ) : (
                <div className={j.grid}>
                  {(openJobs ?? []).map((job) => (
                    <Link key={job.id} href={`/jobs/${job.id}`} className={j.card}>
                      <div className={j.cardTop}>
                        <span className={j.cardTitle}>{job.title}</span>
                        <span className={j.closes}>
                          {job.is_exclusive ? 'early access' : `posted ${timeAgo(job.created_at!)}`}
                        </span>
                      </div>
                      <div className={j.meta}>
                        {job.customer_first_name ? `For ${job.customer_first_name} · ` : ''}
                        {job.town ? `${job.town}, ` : ''}
                        {job.postcode_district} · {job.county}
                      </div>
                      {job.is_exclusive ? (
                        <span className={`${j.badge} ${j.badgeExcl}`}>Paid early access · claim first</span>
                      ) : null}
                      <div className={j.tags}>
                        {(job.service_ids ?? []).slice(0, 4).map((sid) => (
                          <span key={sid} className={j.tag}>
                            {serviceName.get(sid) ?? sid}
                          </span>
                        ))}
                      </div>
                      {job.budget_hint && <div className={j.meta}>Budget: {job.budget_hint}</div>}
                      <div className={j.cardFoot}>
                        <span>{job.is_exclusive ? 'Claim before the free tier' : 'First come, first served'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {(myJobs ?? []).length > 0 && (
                <>
                  <div className={a.groupTitle}>Your jobs</div>
                  <div className={j.grid}>
                    {(myJobs ?? []).map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`} className={j.card}>
                        <div className={j.cardTop}>
                          <span className={j.cardTitle}>{job.title}</span>
                          <span className={j.closes}>{job.status === 'completed' ? 'completed' : 'claimed'}</span>
                        </div>
                        <div className={j.meta}>
                          {job.town ? `${job.town}, ` : ''}
                          {job.postcode_district} · {job.county}
                        </div>
                        <div className={j.cardFoot}>
                          <span>Contact details available</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {claimedFeed.length > 0 && (
                <>
                  <div className={a.groupTitle}>Recently claimed on the network</div>
                  <p className={a.sub}>
                    Jobs other contractors have already taken — sign in often, the
                    fastest claim wins.
                  </p>
                  <div className={j.grid}>
                    {claimedFeed.map((job) => (
                      <div key={job.id} className={`${j.card} ${j.cardClaimed}`}>
                        <div className={j.cardTop}>
                          <span className={j.cardTitle}>{job.title}</span>
                          <span className={j.closes}>claimed {timeAgo(job.claimed_at!)}</span>
                        </div>
                        <div className={j.meta}>
                          {job.town ? `${job.town}, ` : ''}
                          {job.postcode_district} · {job.county}
                        </div>
                        <div className={j.tags}>
                          {(job.service_ids ?? []).slice(0, 4).map((sid) => (
                            <span key={sid} className={j.tag}>
                              {serviceName.get(sid) ?? sid}
                            </span>
                          ))}
                        </div>
                        <div className={j.cardFoot}>
                          <span>Taken by another contractor</span>
                        </div>
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
