import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { timeAgo } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Queues — Admin' };
export const dynamic = 'force-dynamic';

/**
 * The work queues (spec v1.6 §30 view 5): things waiting on a person, each
 * with an age. Disputes and variations are Part 3 — placeholders keep the
 * shape honest.
 */
export default async function QueuesPage() {
  const admin = createServiceRoleClient();

  const [unmatched, failedParses, stale] = await Promise.all([
    admin
      .from('job_submissions')
      .select('id, created_at, service_verbatim, contact_name, county:counties(name)')
      .eq('status', 'confirmed')
      .is('service_id', null)
      .order('created_at', { ascending: true })
      .limit(50),
    admin
      .from('job_submission_parses')
      .select('submission_id, error, created_at')
      .not('error', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('job_submissions')
      .select('id, status, expires_at, contact_name, service:services(name)')
      .in('status', ['distributed', 'quotes_receiving'])
      .lt('expires_at', new Date(Date.now() + 24 * 3600 * 1000).toISOString())
      .order('expires_at', { ascending: true })
      .limit(50),
  ]);

  return (
    <div>
      <h1 className={s.h1}>Queues</h1>
      <p className={s.sub}>Things waiting on a person, oldest first.</p>

      <div className={s.sectionLabel}>Unmatched — needs a service classification</div>
      {(unmatched.data ?? []).length === 0 ? (
        <div className={s.empty}>Nothing waiting.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>In their words</th><th>Customer</th><th>County</th><th>Age</th></tr>
            </thead>
            <tbody>
              {(unmatched.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/submissions/${r.id}`}>{r.service_verbatim ?? '(none)'}</Link></td>
                  <td>{r.contact_name ?? '—'}</td>
                  <td>{(r.county as { name: string } | null)?.name ?? '—'}</td>
                  <td>{timeAgo(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Expiring within 24 hours</div>
      {(stale.data ?? []).length === 0 ? (
        <div className={s.empty}>Nothing near expiry.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Job</th><th>Status</th><th>Customer</th><th>Expires</th></tr>
            </thead>
            <tbody>
              {(stale.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/submissions/${r.id}`}>{(r.service as { name: string } | null)?.name ?? '—'}</Link></td>
                  <td>{r.status}</td>
                  <td>{r.contact_name ?? '—'}</td>
                  <td>{r.expires_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Recent parse failures</div>
      {(failedParses.data ?? []).length === 0 ? (
        <div className={s.empty}>No failed parses recently.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Submission</th><th>Error</th><th>When</th></tr>
            </thead>
            <tbody>
              {(failedParses.data ?? []).map((r, i) => (
                <tr key={i}>
                  <td><Link href={`/admin/submissions/${r.submission_id}`}>view</Link></td>
                  <td>{r.error}</td>
                  <td>{timeAgo(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Disputes</div>
      <div className={s.empty}>No dispute flow yet — Part 3.</div>
      <div className={s.sectionLabel}>Declined variations</div>
      <div className={s.empty}>No variation flow yet — Part 3.</div>
    </div>
  );
}
