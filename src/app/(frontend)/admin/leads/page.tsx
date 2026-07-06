import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { dismissLeadAction, repenLeadAction } from './actions';
import { LeadsIntakePanel } from './LeadsIntakePanel';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Leads — Admin' };

const pillFor: Record<string, string> = {
  pending: s.pillPending,
  converted: s.pillApproved,
  dismissed: s.pillSuspended,
};

type LeadRow = {
  id: string;
  source: string;
  full_name: string;
  phone: string | null;
  postcode: string | null;
  job_hint: string | null;
  status: string;
  job_id: string | null;
  created_at: string;
};

export default async function AdminLeadsPage() {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('leads')
    .select('id, source, full_name, phone, postcode, job_hint, status, job_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const leads = (data ?? []) as LeadRow[];
  const pending = leads.filter((l) => l.status === 'pending');
  const history = leads.filter((l) => l.status !== 'pending');

  return (
    <div>
      <h1 className={s.h1}>Leads</h1>
      <p className={s.sub}>
        Enquiries from Facebook ads land here for approval. {pending.length} waiting.
      </p>

      <LeadsIntakePanel />

      <div className={s.sectionLabel}>Awaiting review</div>
      {pending.length === 0 ? (
        <div className={s.empty}>
          No leads waiting. New Facebook-form submissions appear here automatically.
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Wants</th>
              <th>Postcode</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/admin/leads/${l.id}`}>{l.full_name}</Link>
                </td>
                <td>{l.job_hint ? l.job_hint.slice(0, 60) : '—'}</td>
                <td>{l.postcode ?? '—'}</td>
                <td>{formatDateTime(l.created_at)}</td>
                <td>
                  <div className={s.actions}>
                    <Link href={`/admin/leads/${l.id}`} className={s.btnApprove}>
                      Review
                    </Link>
                    <form action={dismissLeadAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className={s.btnSuspend}>
                        Dismiss
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>History</div>
      {history.length === 0 ? (
        <div className={s.empty}>No processed leads yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Wants</th>
              <th>Status</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((l) => (
              <tr key={l.id}>
                <td>{l.full_name}</td>
                <td>{l.job_hint ? l.job_hint.slice(0, 60) : '—'}</td>
                <td>
                  <span className={`${s.pill} ${pillFor[l.status] ?? ''}`}>{l.status}</span>
                  {l.job_id && (
                    <>
                      {' '}
                      <Link href={`/admin/jobs/${l.job_id}`}>job →</Link>
                    </>
                  )}
                </td>
                <td>{formatDateTime(l.created_at)}</td>
                <td>
                  {l.status === 'dismissed' && (
                    <form action={repenLeadAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className={s.btnSuspend} style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
                        Restore
                      </button>
                    </form>
                  )}
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
