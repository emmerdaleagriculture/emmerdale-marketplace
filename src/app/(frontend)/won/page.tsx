import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { nonContractorPath } from '@/lib/auth';
import { ContactUsButton } from '@/components/ContactUsButton';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { formatGBP } from '@/lib/sealedQuotes/money';
import { formatDateTime } from '@/lib/time';
import { FirstContactButton } from './FirstContactButton';
import { MarkDoneButton } from './MarkDoneButton';
import { InvoiceUpload } from './InvoiceUpload';
import { ProposeWorkForm } from './ProposeWorkForm';
import a from '../auth.module.css';
import { Breadcrumb } from '@/components/Breadcrumb';
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
  if (!contractor) redirect(await nonContractorPath(user.id));

  const { data } = await supabase
    .from('my_sq_won_jobs')
    .select('*')
    .order('awarded_at', { ascending: false })
    .limit(50);
  const jobs = data ?? [];

  // Each job's thread with the customer lives on its pricing page, keyed by
  // the invitation token. inv_select_own limits this to their own rows.
  const ids = jobs.map((j) => j.id).filter((id): id is string => Boolean(id));
  const { data: invs } = ids.length
    ? await supabase
        .from('job_invitations')
        .select('submission_id, token')
        .eq('contractor_id', user.id)
        .in('submission_id', ids)
    : { data: [] };
  const threadToken = new Map((invs ?? []).map((i) => [i.submission_id, i.token]));

  // Extra work on the job that the customer hasn't answered — theirs or one
  // an admin keyed in. One at a time per job (contractor_add_extra_work
  // refuses a second), so the card says so instead of offering a form that
  // would be refused.
  const admin = createServiceRoleClient();
  const [openExtrasRes, markupRes] = await Promise.all([
    ids.length
      ? admin
          .from('job_submissions')
          .select('extra_work_of, service_verbatim')
          .in('extra_work_of', ids)
          .in('status', ['confirmed', 'distributed', 'quotes_receiving', 'accepted_awaiting_payment'])
      : Promise.resolve({ data: [] }),
    admin.from('app_config').select('value').eq('key', 'sq_markup_rate').maybeSingle(),
  ]);
  const openExtra = new Map(
    (openExtrasRes.data ?? []).map((x) => [x.extra_work_of, x.service_verbatim ?? 'extra work']),
  );
  const markupRate = Number(markupRes.data?.value ?? 0.1);

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={a.wide}>
          <Breadcrumb
            tone="light"
            jsonLd={false}
            skipHome
            items={[{ label: 'Dashboard', href: '/account' }, { label: 'Won jobs' }]}
          />
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
                  {job.id && threadToken.get(job.id) && (
                    <p>
                      <a className={s.dLink} href={`/quote/${threadToken.get(job.id)}#messages`}>
                        Messages with the customer →
                      </a>
                    </p>
                  )}
                  {job.status === 'awarded' && job.id && (
                    <FirstContactButton submissionId={job.id} />
                  )}
                  {['awarded', 'contacted', 'scheduled', 'in_progress'].includes(
                    job.status ?? '',
                  ) &&
                    job.id && <MarkDoneButton submissionId={job.id} />}
                  {/* Extras go through us (terms clause 5) — and this is
                      "through us": a job of its own, held for them, that the
                      customer accepts or ignores. Every booked state
                      qualifies, the same as the admin's form. */}
                  {job.id &&
                    ['awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor', 'completed', 'paid'].includes(job.status ?? '') &&
                    (openExtra.has(job.id) ? (
                      <p className={s.invoiceHint} style={{ marginTop: 12 }}>
                        Extra work — &ldquo;{openExtra.get(job.id)}&rdquo; — is priced and with
                        the customer. We&rsquo;ll tell you when they answer.
                      </p>
                    ) : (
                      <ProposeWorkForm
                        submissionId={job.id}
                        customerName={job.contact_name?.trim().split(/\s+/)[0] || 'the customer'}
                        markupRate={markupRate}
                      />
                    ))}
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

          <ContactUsButton
            subject="Contractor enquiry — a won job"
            note="Trouble reaching a customer, a problem on site, or a question about your payout?"
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
