import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { BidPanel } from './BidPanel';
import { PaidPanel } from './PaidPanel';
import { createClient } from '@/lib/supabase/server';
import { getServices } from '@/lib/reference';
import { closesIn, formatDateTime, poundsFromPence } from '@/lib/time';
import a from '../../auth.module.css';
import j from '../jobs.module.css';

export const metadata: Metadata = { title: 'Job' };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: contractor } = await supabase
    .from('contractors')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) redirect('/onboarding');
  if (contractor.status !== 'approved') redirect('/jobs');

  // Open + in-county job (public view) and/or a job we've bid on (any status).
  const [{ data: pub }, { data: mine }, services] = await Promise.all([
    supabase.from('public_jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('my_bid_jobs').select('*').eq('id', id).maybeSingle(),
    getServices(),
  ]);

  const job = pub ?? mine;
  if (!job) notFound();

  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const isOpen = !!pub;
  const paidAccess = !!pub?.paid_access; // active subscriber viewing an open/exclusive job
  const isExclusive = !!pub?.is_exclusive;

  // Reveal customer contact for: paid members (any visible job) or a bid winner
  // after close. get_job_contact logs the reveal (paid_access / bid_won).
  let contact: { customer_name: string; customer_phone: string; customer_email: string | null } | null = null;
  if (paidAccess || (!isOpen && mine?.won)) {
    const { data } = await supabase.rpc('get_job_contact', { p_job_id: id });
    contact = (data ?? [])[0] ?? null;
  }

  return (
    <div className={a.wrap}>
      <SiteHeader />
      <main className={a.main}>
        <div className={j.detailWrap}>
          <Link href="/jobs" className={j.card} style={{ display: 'inline-block', border: 'none', padding: 0, color: 'var(--jd-green)', marginBottom: 12 }}>
            ← Back to jobs
          </Link>
          <div className={a.eyebrow}>{job.county}</div>
          <h1 className={a.title}>{job.title}</h1>
          <p className={a.sub}>
            {job.customer_first_name ? `For ${job.customer_first_name} · ` : ''}
            {job.town ? `${job.town}, ` : ''}
            {job.postcode_district}
            {isExclusive
              ? ' · paid early access'
              : isOpen
                ? ` · closes ${closesIn(job.bidding_closes_at!)}`
                : ` · closed ${formatDateTime(job.bidding_closes_at!)}`}
          </p>

          <p style={{ lineHeight: 1.7, color: 'var(--ink)' }}>{job.description}</p>

          <div className={j.tags} style={{ marginTop: 16 }}>
            {(job.service_ids ?? []).map((sid) => (
              <span key={sid} className={j.tag}>
                {serviceName.get(sid) ?? sid}
              </span>
            ))}
          </div>
          {job.budget_hint && (
            <p className={a.sub} style={{ marginTop: 14 }}>
              <strong>Budget hint:</strong> {job.budget_hint}
            </p>
          )}

          {paidAccess ? (
            <PaidPanel jobId={id} contact={contact} isExclusive={isExclusive} />
          ) : isOpen ? (
            <BidPanel
              jobId={id}
              currentAmountPence={mine?.my_amount_pence ?? null}
              currentNote={mine?.my_note ?? null}
            />
          ) : mine?.won ? (
            <>
              <div className={`${j.outcome} ${j.won}`}>
                <strong>You won this job</strong> with a bid of{' '}
                {poundsFromPence(mine.my_amount_pence!)}. Contact the customer to
                arrange the work — you invoice them directly.
              </div>
              {contact && (
                <div className={`${j.panel} ${j.contact}`}>
                  <div className={j.panelTitle}>Customer contact</div>
                  <div className={j.contactRow}>
                    <strong>Name</strong> {contact.customer_name}
                  </div>
                  <div className={j.contactRow}>
                    <strong>Phone</strong> {contact.customer_phone}
                  </div>
                  {contact.customer_email && (
                    <div className={j.contactRow}>
                      <strong>Email</strong> {contact.customer_email}
                    </div>
                  )}
                  <p className={a.sub} style={{ marginTop: 14, marginBottom: 0, fontSize: 13 }}>
                    These details are for this enquiry only.
                  </p>
                </div>
              )}
            </>
          ) : mine?.status === 'awarded' ? (
            <div className={`${j.outcome} ${j.lost}`}>
              This job was awarded to another contractor. Your bid of{' '}
              {poundsFromPence(mine.my_amount_pence!)} wasn’t selected this time.
            </div>
          ) : (
            <div className={`${j.outcome} ${j.lost}`}>
              This job is {mine?.status}. Bidding is closed.
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
