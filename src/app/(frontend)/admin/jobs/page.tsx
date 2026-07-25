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
  withdrawn: s.pillSuspended,
  completed: s.pillApproved,
};

export default async function AdminJobsPage() {
  const admin = createServiceRoleClient();
  const [{ data: jobs }, { data: reveals }] = await Promise.all([
    admin
      .from('jobs')
      .select('id, title, town, postcode_district, status, created_at, counties(name)')
      .order('created_at', { ascending: false }),
    admin.from('contact_reveals').select('job_id'),
  ]);

  const list = jobs ?? [];

  // How many contractors have opened each job (small dataset at launch).
  const opensFor = new Map<string, number>();
  for (const r of reveals ?? []) {
    opensFor.set(r.job_id, (opensFor.get(r.job_id) ?? 0) + 1);
  }

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
              <th>Opened by</th>
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
                  {j.postcode_district ?? '—'}
                </td>
                <td>{(j.counties as { name: string } | null)?.name}</td>
                <td>
                  <span className={`${s.pill} ${pillFor[j.status] ?? ''}`}>{j.status}</span>
                </td>
                <td>{opensFor.get(j.id) ? `${opensFor.get(j.id)} contractor${opensFor.get(j.id) === 1 ? '' : 's'}` : '—'}</td>
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
