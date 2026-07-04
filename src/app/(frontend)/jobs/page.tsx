import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { createClient } from '@/lib/supabase/server';
import { getServices } from '@/lib/reference';
import { closesIn, poundsFromPence } from '@/lib/time';
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
  if (!contractor) redirect('/signup');

  const services = await getServices();
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  const gated = contractor.status !== 'approved';

  const [{ data: openJobs }, { data: myBids }] = gated
    ? [{ data: [] as never[] }, { data: [] as never[] }]
    : await Promise.all([
        supabase.from('public_jobs').select('*').order('bidding_closes_at', { ascending: true }),
        supabase.from('my_bid_jobs').select('*'),
      ]);

  const myBidByJob = new Map((myBids ?? []).map((b) => [b.id, b]));

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
                Jobs in the counties you cover. Put in a bid — win it and you get
                the customer’s details to arrange the work directly.
              </p>

              {(openJobs ?? []).length === 0 ? (
                <div className={j.gate} style={{ background: 'var(--cream)', borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
                  No open jobs in your counties right now. We’ll email you when one
                  comes up.
                </div>
              ) : (
                <div className={j.grid}>
                  {(openJobs ?? []).map((job) => {
                    const mine = myBidByJob.get(job.id!);
                    const soon = new Date(job.bidding_closes_at!).getTime() - Date.now() < 4 * 3600e3;
                    return (
                      <Link key={job.id} href={`/jobs/${job.id}`} className={j.card}>
                        <div className={j.cardTop}>
                          <span className={j.cardTitle}>{job.title}</span>
                          <span className={`${j.closes} ${soon ? j.closesSoon : ''}`}>
                            {closesIn(job.bidding_closes_at!)}
                          </span>
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
                        {job.budget_hint && <div className={j.meta}>Budget: {job.budget_hint}</div>}
                        <div className={j.cardFoot}>
                          <span>
                            {job.bid_count} bid{job.bid_count === 1 ? '' : 's'}
                          </span>
                          {mine ? (
                            <span className={j.yourBid}>
                              Your bid: {poundsFromPence(mine.my_amount_pence!)}
                            </span>
                          ) : (
                            <span>Not yet bid</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {(myBids ?? []).length > 0 && (
                <>
                  <div className={a.groupTitle}>Your bids</div>
                  <div className={j.grid}>
                    {(myBids ?? []).map((b) => (
                      <Link key={b.id} href={`/jobs/${b.id}`} className={j.card}>
                        <div className={j.cardTop}>
                          <span className={j.cardTitle}>{b.title}</span>
                          <span className={j.closes}>{b.status}</span>
                        </div>
                        <div className={j.meta}>
                          {b.town ? `${b.town}, ` : ''}
                          {b.postcode_district} · {b.county}
                        </div>
                        <div className={j.cardFoot}>
                          <span className={j.yourBid}>{poundsFromPence(b.my_amount_pence!)}</span>
                          <span>{b.won ? 'Won' : b.status === 'awarded' ? 'Not selected' : ''}</span>
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
