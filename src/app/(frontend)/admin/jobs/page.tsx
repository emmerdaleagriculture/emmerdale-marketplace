import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Jobs — Admin' };

const pillFor: Record<string, string> = {
  open: s.pillApproved,
  exclusive: s.pillPending,
  claimed: s.pillApproved,
  withdrawn: s.pillSuspended,
  completed: s.pillApproved,
};

export default async function AdminJobsPage() {
  const admin = createServiceRoleClient();
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, title, town, postcode_district, status, claimed_by, created_at, counties(name)')
    .order('created_at', { ascending: false });

  const list = jobs ?? [];

  // Resolve the business name of each claimant (small dataset at launch).
  const claimerIds = Array.from(new Set(list.map((j) => j.claimed_by).filter(Boolean))) as string[];
  const { data: claimers } = claimerIds.length
    ? await admin.from('contractors').select('id, business_name').in('id', claimerIds)
    : { data: [] as { id: string; business_name: string }[] };
  const claimerName = new Map((claimers ?? []).map((c) => [c.id, c.business_name]));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <h1 className={s.h1}>Jobs</h1>
        <Link href="/admin/jobs/new" className={f.btnPrimary}>
          Post a job
        </Link>
      </div>
      <p className={s.sub}>{list.length} total</p>

      {list.length === 0 ? (
        <div className={s.empty}>No jobs yet. Post the first one.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Location</th>
              <th>County</th>
              <th>Status</th>
              <th>Claimed by</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id}>
                <td>
                  <Link href={`/admin/jobs/${j.id}`}>{j.title}</Link>
                </td>
                <td>
                  {j.town ? `${j.town}, ` : ''}
                  {j.postcode_district}
                </td>
                <td>{(j.counties as { name: string } | null)?.name}</td>
                <td>
                  <span className={`${s.pill} ${pillFor[j.status] ?? ''}`}>{j.status}</span>
                </td>
                <td>{j.claimed_by ? (claimerName.get(j.claimed_by) ?? '—') : '—'}</td>
                <td>{formatDateTime(j.created_at)}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
