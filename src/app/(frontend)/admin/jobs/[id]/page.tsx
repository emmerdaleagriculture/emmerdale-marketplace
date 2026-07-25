import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withdrawJobAction, relistJobAction, completeJobAction } from '../actions';
import { formatDateTime } from '@/lib/time';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Job — Admin' };

const pillFor: Record<string, string> = {
  open: s.pillApproved,
  exclusive: s.pillPending,
  withdrawn: s.pillSuspended,
  completed: s.pillApproved,
};

export default async function AdminJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: job } = await admin
    .from('jobs')
    .select('*, counties(name)')
    .eq('id', id)
    .maybeSingle();
  if (!job) notFound();

  const [{ data: allServices }, { data: reveals }] = await Promise.all([
    admin.from('services').select('id, name'),
    admin
      .from('contact_reveals')
      .select('revealed_at, route, contractors(business_name, contact_name, phone, email)')
      .eq('job_id', id)
      .order('revealed_at', { ascending: true }),
  ]);

  const serviceMap = new Map((allServices ?? []).map((sv) => [sv.id, sv.name]));
  const serviceNames = (job.service_ids ?? []).map((sid) => serviceMap.get(sid)).filter(Boolean);
  const county = (job.counties as { name: string } | null)?.name;
  const opens = reveals ?? [];

  return (
    <div>
      <Link href="/admin/jobs" className={s.back}>
        ← All jobs
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 className={s.h1}>{job.title}</h1>
        <span className={`${s.pill} ${pillFor[job.status] ?? ''}`}>{job.status}</span>
      </div>
      <p className={s.sub}>
        {county} · {job.town ? `${job.town}, ` : ''}
        {job.postcode_district ?? 'no postcode'} · posted {formatDateTime(job.created_at)}
      </p>

      <div className={s.detailGrid}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className={s.dLabel}>Description</div>
          <div className={s.dValue}>{job.description}</div>
        </div>
        <div>
          <div className={s.dLabel}>Services</div>
          <div className={s.dValue}>{serviceNames.join(', ') || '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Budget hint</div>
          <div className={s.dValue}>{job.budget_hint || '—'}</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Customer (private)</div>
      <div className={s.detailGrid}>
        <div>
          <div className={s.dLabel}>Name</div>
          <div className={s.dValue}>{job.customer_name}</div>
        </div>
        <div>
          <div className={s.dLabel}>Phone</div>
          <div className={s.dValue}>{job.customer_phone}</div>
        </div>
        <div>
          <div className={s.dLabel}>Email</div>
          <div className={s.dValue}>{job.customer_email || '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Full postcode</div>
          <div className={s.dValue}>{job.postcode || '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Consent</div>
          <div className={s.dValue}>
            {job.consent_to_share ? `Yes (${job.consent_wording_version})` : 'No'}
          </div>
        </div>
      </div>

      <div className={s.sectionLabel}>Opened by ({opens.length})</div>
      {opens.length === 0 ? (
        <div className={s.empty}>No contractor has opened this job yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Contractor</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {opens.map((r, i) => {
                const ct = r.contractors as {
                  business_name: string;
                  contact_name: string;
                  phone: string;
                  email: string;
                } | null;
                return (
                  <tr key={i}>
                    <td>{ct?.business_name ?? 'No longer on record'}</td>
                    <td>{ct ? `${ct.contact_name} · ${ct.phone}` : '—'}</td>
                    <td>{ct?.email ?? '—'}</td>
                    <td>{formatDateTime(r.revealed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Actions</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {['exclusive', 'open'].includes(job.status) && (
          <>
            <form action={completeJobAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <button type="submit" className={s.btnApprove}>
                Mark filled
              </button>
            </form>
            <form action={withdrawJobAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <button type="submit" className={s.btnSuspend}>
                Withdraw
              </button>
            </form>
          </>
        )}
        {['withdrawn', 'completed'].includes(job.status) && (
          <form action={relistJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button type="submit" className={s.btnApprove}>
              Relist
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
