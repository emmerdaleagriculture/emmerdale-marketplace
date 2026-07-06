import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { awardBidAction, extendCloseAction, withdrawJobAction, relistJobAction } from '../actions';
import { closesIn, formatDateTime, poundsFromPence } from '@/lib/time';
import s from '../../admin.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Job — Admin' };

const pillFor: Record<string, string> = {
  open: s.pillApproved,
  exclusive: s.pillPending,
  awarded: s.pillApproved,
  expired: s.pillSuspended,
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

  const [{ data: bids }, { data: allServices }, { data: reveals }] = await Promise.all([
    admin
      .from('bids')
      .select('id, amount_pence, note, created_at, contractors(business_name, phone, email)')
      .eq('job_id', id)
      .order('amount_pence', { ascending: true })
      .order('created_at', { ascending: true }),
    admin.from('services').select('id, name'),
    admin.from('contact_reveals').select('route').eq('job_id', id),
  ]);

  const serviceMap = new Map((allServices ?? []).map((sv) => [sv.id, sv.name]));
  const serviceNames = (job.service_ids ?? []).map((sid) => serviceMap.get(sid)).filter(Boolean);
  const isOpen = job.status === 'open';
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
        {job.postcode_district} ·{' '}
        {isOpen ? `closes ${closesIn(job.bidding_closes_at)}` : `closed ${formatDateTime(job.bidding_closes_at)}`}
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
        <div>
          <div className={s.dLabel}>Contact reveals</div>
          <div className={s.dValue}>
            {(reveals ?? []).length} ({(reveals ?? []).filter((r) => r.route === 'paid_access').length} paid)
          </div>
        </div>
      </div>

      <div className={s.sectionLabel}>Bids ({(bids ?? []).length})</div>
      {(bids ?? []).length === 0 ? (
        <div className={s.empty}>No bids yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Contractor</th>
              <th>Amount</th>
              <th>Note</th>
              <th>Placed</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(bids ?? []).map((b) => {
              const c = b.contractors as { business_name: string } | null;
              const isWinner = job.awarded_bid_id === b.id;
              return (
                <tr key={b.id}>
                  <td>{c?.business_name}</td>
                  <td>
                    <strong>{poundsFromPence(b.amount_pence)}</strong>
                    {isWinner && <span className={`${s.pill} ${s.pillApproved}`} style={{ marginLeft: 8 }}>won</span>}
                  </td>
                  <td>{b.note || '—'}</td>
                  <td>{formatDateTime(b.created_at)}</td>
                  <td>
                    {isOpen && (
                      <form action={awardBidAction}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="bid_id" value={b.id} />
                        <button type="submit" className={s.btnApprove}>
                          Award
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>Actions</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {isOpen && (
          <form action={extendCloseAction} className={f.field} style={{ marginBottom: 0 }}>
            <span className={f.label}>Extend close time</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="hidden" name="job_id" value={job.id} />
              <input className={f.input} type="datetime-local" name="closes_at" required />
              <button type="submit" className={f.btnGhost}>
                Extend
              </button>
            </div>
          </form>
        )}
        {['exclusive', 'open', 'expired'].includes(job.status) && (
          <form action={withdrawJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button type="submit" className={s.btnSuspend}>
              Withdraw
            </button>
          </form>
        )}
        {['expired', 'withdrawn'].includes(job.status) && (
          <form action={relistJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button type="submit" className={s.btnApprove}>
              Relist (24h)
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
