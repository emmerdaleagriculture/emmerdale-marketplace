import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
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

  // A live job in our counties (public view) and/or one we've already opened.
  const [{ data: pub }, { data: mine }, services] = await Promise.all([
    supabase.from('public_jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('my_opened_jobs').select('*').eq('id', id).maybeSingle(),
    getServices(),
  ]);

  const job = pub ?? mine;
  if (!job) notFound();

  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  // Opening the page IS the tracked event: open_job logs who viewed the
  // customer's details (first call only) and returns the contact.
  const { data: contactRows } = await supabase.rpc('open_job', { p_job_id: id });
  const contact = (contactRows ?? [])[0] ?? null;

  // Withdrawn or filled: the contractor keeps the details they were shown, but
  // shouldn't be urged to chase the customer.
  const closed = mine != null && ['completed', 'withdrawn'].includes(mine.status ?? '');
  const location = [job.town, job.postcode_district].filter(Boolean).join(', ');

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
            {job.customer_first_name ? `For ${job.customer_first_name}` : ''}
            {job.customer_first_name && location ? ' · ' : ''}
            {location}
            {closed ? ' · no longer open' : ''}
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

          {contact ? (
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
                {closed
                  ? 'This job is no longer open, but you keep the details you were shown.'
                  : 'Other contractors in the area can see this job too — the customer decides who to hire, so get in touch soon. You arrange the work and invoice them directly. These details are for this enquiry only.'}
              </p>
            </div>
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
