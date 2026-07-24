import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ClaimPanel } from './ClaimPanel';
import { createClient } from '@/lib/supabase/server';
import { getServices } from '@/lib/reference';
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

  // A claimable job (public view) and/or a job we've already claimed.
  const [{ data: pub }, { data: mine }, services] = await Promise.all([
    supabase.from('public_jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('my_claimed_jobs').select('*').eq('id', id).maybeSingle(),
    getServices(),
  ]);

  const job = pub ?? mine;
  if (!job) notFound();

  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const claimable = !!pub;
  const claimed = !!mine;

  // The claimant sees the customer's contact (get_job_contact gates on it).
  let contact: { customer_name: string; customer_phone: string; customer_email: string | null } | null = null;
  if (claimed) {
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
            {claimed ? ' · claimed by you' : ''}
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

          {claimable ? (
            <ClaimPanel jobId={id} />
          ) : claimed ? (
            <>
              <div className={`${j.outcome} ${j.won}`}>
                <strong>This job is yours.</strong> Contact the customer to arrange
                the work — you invoice them directly.
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
          ) : (
            <div className={`${j.outcome} ${j.lost}`}>
              This job is no longer available.
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
