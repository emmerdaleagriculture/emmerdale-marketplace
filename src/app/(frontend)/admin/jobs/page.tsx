import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { closesIn, formatDateTime } from '@/lib/time';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Jobs — Admin' };

const pillFor: Record<string, string> = {
  open: s.pillApproved,
  exclusive: s.pillPending,
  awarded: s.pillApproved,
  expired: s.pillSuspended,
  withdrawn: s.pillSuspended,
  completed: s.pillApproved,
};

export default async function AdminJobsPage() {
  const admin = createServiceRoleClient();
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, title, town, postcode_district, status, bidding_closes_at, created_at, counties(name)')
    .order('created_at', { ascending: false });

  const list = jobs ?? [];

  // Bid + reveal counts per job (small dataset at launch; fine to fetch all).
  const [{ data: bids }, { data: reveals }] = await Promise.all([
    admin.from('bids').select('job_id'),
    admin.from('contact_reveals').select('job_id'),
  ]);
  const bidCount = new Map<string, number>();
  (bids ?? []).forEach((b) => bidCount.set(b.job_id, (bidCount.get(b.job_id) ?? 0) + 1));
  const revealCount = new Map<string, number>();
  (reveals ?? []).forEach((r) => revealCount.set(r.job_id, (revealCount.get(r.job_id) ?? 0) + 1));

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
              <th>Bids</th>
              <th>Reveals</th>
              <th>Closes</th>
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
                <td>{bidCount.get(j.id) ?? 0}</td>
                <td>{revealCount.get(j.id) ?? 0}</td>
                <td>
                  {j.status === 'open' ? closesIn(j.bidding_closes_at) : formatDateTime(j.bidding_closes_at)}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
