import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { setContractorStatus } from '../actions';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Contractor — Admin' };

const pillClass: Record<string, string> = {
  pending: s.pillPending,
  approved: s.pillApproved,
  suspended: s.pillSuspended,
};

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: c } = await admin.from('contractors').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();

  const [{ data: ccRows }, { data: allServices }] = await Promise.all([
    admin.from('contractor_counties').select('counties(name, region)').eq('contractor_id', id),
    admin.from('services').select('id, name'),
  ]);

  const countyNames = (ccRows ?? [])
    .map((r) => (r.counties as { name: string } | null)?.name)
    .filter(Boolean) as string[];
  const serviceMap = new Map((allServices ?? []).map((sv) => [sv.id, sv.name]));
  const serviceNames = (c.services ?? []).map((sid) => serviceMap.get(sid)).filter(Boolean) as string[];

  return (
    <div>
      <Link href="/admin/contractors" className={s.back}>
        ← All contractors
      </Link>
      <h1 className={s.h1}>{c.business_name}</h1>
      <p className={s.sub}>
        <span className={`${s.pill} ${pillClass[c.status] ?? ''}`}>{c.status}</span>
      </p>

      <div className={s.detailGrid}>
        <div>
          <div className={s.dLabel}>Contact name</div>
          <div className={s.dValue}>{c.contact_name}</div>
        </div>
        <div>
          <div className={s.dLabel}>Email</div>
          <div className={s.dValue}>{c.email}</div>
        </div>
        <div>
          <div className={s.dLabel}>Phone</div>
          <div className={s.dValue}>{c.phone}</div>
        </div>
        <div>
          <div className={s.dLabel}>Base postcode</div>
          <div className={s.dValue}>{c.base_postcode}</div>
        </div>
        <div>
          <div className={s.dLabel}>Notify on new jobs</div>
          <div className={s.dValue}>{c.notify_new_jobs ? 'Yes' : 'No'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Registered</div>
          <div className={s.dValue}>{new Date(c.created_at).toLocaleDateString('en-GB')}</div>
        </div>
      </div>

      <div className={s.sectionLabel}>Counties covered ({countyNames.length})</div>
      <div className={s.tags}>
        {countyNames.length ? (
          countyNames.map((n) => (
            <span key={n} className={s.tag}>
              {n}
            </span>
          ))
        ) : (
          <span className={s.dValue}>None selected</span>
        )}
      </div>

      <div className={s.sectionLabel}>Services ({serviceNames.length})</div>
      <div className={s.tags}>
        {serviceNames.length ? (
          serviceNames.map((n) => (
            <span key={n} className={s.tag}>
              {n}
            </span>
          ))
        ) : (
          <span className={s.dValue}>None selected</span>
        )}
      </div>

      <div className={s.sectionLabel}>Actions</div>
      <div className={s.actions}>
        {c.status !== 'approved' && (
          <form action={setContractorStatus}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="approved" />
            <button type="submit" className={s.btnApprove}>
              Approve
            </button>
          </form>
        )}
        {c.status !== 'suspended' && (
          <form action={setContractorStatus}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="suspended" />
            <button type="submit" className={s.btnSuspend}>
              Suspend
            </button>
          </form>
        )}
        {c.status === 'suspended' && (
          <form action={setContractorStatus}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="pending" />
            <button type="submit" className={s.btnSuspend} style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}>
              Move to pending
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
