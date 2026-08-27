import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import { FirstContactButton } from './FirstContactButton';
import a from '../auth.module.css';
import s from './won.module.css';

export const metadata: Metadata = {
  title: 'Won jobs',
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  awarded: 'Yours — contact the customer',
  contacted: 'Contact logged',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_by_contractor: 'Awaiting confirmation',
  completed: 'Complete — paid out on release',
  paid: 'Paid',
};

/**
 * Won jobs (§25): the full client details, released only on award, plus the
 * one-tap first-contact log. The customer has paid in full — the money is
 * held and released on completion; silence after payment is the biggest
 * reputational risk, hence the 24-hour contact expectation front and centre.
 */
export default async function WonJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/won');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect('/onboarding');

  const { data } = await supabase
    .from('my_sq_won_jobs')
    .select('*')
    .order('awarded_at', { ascending: false })
    .limit(50);
  const jobs = data ?? [];

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <div className={a.eyebrow}>The network</div>
          <h1 className={a.title}>Won jobs</h1>
          <p className={a.sub}>
            Each of these customers accepted your price and has paid in full. The
            money is held by Emmerdale and released to you when the work&rsquo;s done —
            contact them and get it arranged as soon as you can.
          </p>

          {jobs.length === 0 ? (
            <div className={s.empty}>
              Nothing yet. When a customer accepts your price and pays, the job —
              and their full details — appear here.
            </div>
          ) : (
            <div className={s.list}>
              {jobs.map((job) => (
                <div key={job.id} className={s.card}>
                  <div className={s.cardHead}>
                    <span className={s.service}>{job.service}</span>
                    <span className={s.status}>{STATUS_LABELS[job.status ?? ''] ?? job.status}</span>
                  </div>
                  <div className={s.detailGrid}>
                    <div>
                      <div className={s.dLabel}>Customer</div>
                      <div>{job.contact_name}</div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Phone</div>
                      <div>{job.contact_phone}</div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Email</div>
                      <div>{job.contact_email ?? '—'}</div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Postcode</div>
                      <div>{job.postcode ?? '—'}</div>
                    </div>
                    {job.gate_w3w && (
                      <div>
                        <div className={s.dLabel}>Gate</div>
                        <div>{`///${job.gate_w3w}`}</div>
                      </div>
                    )}
                    <div>
                      <div className={s.dLabel}>Your price</div>
                      <div>
                        {job.contractor_price_pence != null
                          ? formatGBP(job.contractor_price_pence)
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Won</div>
                      <div>{job.awarded_at ? formatDateTime(job.awarded_at) : '—'}</div>
                    </div>
                  </div>
                  {job.status === 'awarded' && job.id && (
                    <FirstContactButton submissionId={job.id} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
