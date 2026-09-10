import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import { FirstContactButton } from './FirstContactButton';
import { MarkDoneButton } from './MarkDoneButton';
import { InvoiceUpload } from './InvoiceUpload';
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
  completed_by_contractor: 'Done — awaiting the customer’s confirmation',
  completed: 'Complete — waiting for the customer’s balance',
  paid: 'Customer paid in full — payout due on your invoice',
};

/**
 * Won jobs (§25): the full client details, released only on award, plus the
 * one-tap first-contact log. The customer has paid a deposit and owes the
 * balance on sign-off; silence after booking is the biggest reputational risk,
 * hence the 24-hour contact expectation front and centre.
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
            Each of these customers accepted your price and paid a deposit. You&rsquo;re
            paid your full price once the job is done, they&rsquo;ve confirmed it, the
            balance has cleared and your invoice is in — contact them and get it
            arranged as soon as you can.
          </p>

          {jobs.length === 0 ? (
            <div className={s.empty}>
              Nothing yet. When a customer accepts your price and pays their deposit,
              the job — and their full details — appear here.
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
                      {/* This page exists to get the contractor talking to the
                          customer, and most of them open it on a phone. */}
                      <div>
                        {job.contact_phone ? (
                          <a className={s.dLink} href={`tel:${job.contact_phone.replace(/\s+/g, '')}`}>
                            {job.contact_phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Email</div>
                      <div>
                        {job.contact_email ? (
                          <a className={s.dLink} href={`mailto:${job.contact_email}`}>
                            {job.contact_email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    <div>
                      <div className={s.dLabel}>Postcode</div>
                      <div>
                        {job.postcode ? (
                          <a
                            className={s.dLink}
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.postcode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {job.postcode}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    {job.gate_w3w && (
                      <div>
                        <div className={s.dLabel}>Gate</div>
                        <div>
                          <a
                            className={s.dLink}
                            href={`https://what3words.com/${job.gate_w3w}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >{`///${job.gate_w3w}`}</a>
                        </div>
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
                  {['awarded', 'contacted', 'scheduled', 'in_progress'].includes(
                    job.status ?? '',
                  ) &&
                    job.id && <MarkDoneButton submissionId={job.id} />}
                  {/* The customer has confirmed and the money is ours to
                      release — all that is missing is their invoice. */}
                  {['completed', 'paid'].includes(job.status ?? '') && job.id && (
                    <InvoiceUpload
                      submissionId={job.id}
                      sentName={job.contractor_invoice_name}
                      sentAt={job.contractor_invoice_at}
                    />
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
