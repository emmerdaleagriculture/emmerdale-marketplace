import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { withdrawJobAction, relistJobAction } from '../actions';
import { formatDateTime } from '@/lib/time';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Job — Admin' };

const pillFor: Record<string, string> = {
  open: s.pillApproved,
  exclusive: s.pillPending,
  claimed: s.pillApproved,
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

  const [{ data: allServices }, { data: claimant }] = await Promise.all([
    admin.from('services').select('id, name'),
    job.claimed_by
      ? admin.from('contractors').select('business_name, contact_name, phone, email').eq('id', job.claimed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const serviceMap = new Map((allServices ?? []).map((sv) => [sv.id, sv.name]));
  const serviceNames = (job.service_ids ?? []).map((sid) => serviceMap.get(sid)).filter(Boolean);
  const county = (job.counties as { name: string } | null)?.name;

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
        {job.postcode_district} · posted {formatDateTime(job.created_at)}
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
          <div className={s.dValue}>{job.postcode}</div>
        </div>
        <div>
          <div className={s.dLabel}>Consent</div>
          <div className={s.dValue}>
            {job.consent_to_share ? `Yes (${job.consent_wording_version})` : 'No'}
          </div>
        </div>
      </div>

      <div className={s.sectionLabel}>Claim</div>
      {claimant ? (
        <div className={s.detailGrid}>
          <div>
            <div className={s.dLabel}>Claimed by</div>
            <div className={s.dValue}>{claimant.business_name}</div>
          </div>
          <div>
            <div className={s.dLabel}>Contact</div>
            <div className={s.dValue}>{claimant.contact_name} · {claimant.phone}</div>
          </div>
          <div>
            <div className={s.dLabel}>Email</div>
            <div className={s.dValue}>{claimant.email}</div>
          </div>
          <div>
            <div className={s.dLabel}>Claimed at</div>
            <div className={s.dValue}>{job.claimed_at ? formatDateTime(job.claimed_at) : '—'}</div>
          </div>
        </div>
      ) : job.status === 'claimed' ? (
        // Claimed but no claimant on record (e.g. the contractor was deleted).
        <div className={s.empty}>Claimed — claimant no longer on record.</div>
      ) : (
        <div className={s.empty}>Not claimed yet.</div>
      )}

      <div className={s.sectionLabel}>Actions</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {['exclusive', 'open'].includes(job.status) && (
          <form action={withdrawJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button type="submit" className={s.btnSuspend}>
              Withdraw
            </button>
          </form>
        )}
        {job.status === 'withdrawn' && (
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
