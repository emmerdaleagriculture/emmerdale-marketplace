import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { setContractorStatus } from '../actions';
import { DeleteContractorButton } from '../DeleteContractorButton';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Contractor — Admin' };

const pillClass: Record<string, string> = {
  pending: s.pillPending,
  approved: s.pillApproved,
  suspended: s.pillSuspended,
};

export default async function ContractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { blocked } = await searchParams;
  const admin = createServiceRoleClient();

  const { data: c } = await admin.from('contractors').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();

  const { data: ccRows } = await admin
    .from('contractor_counties')
    .select('counties(name, region)')
    .eq('contractor_id', id);

  const countyNames = (ccRows ?? [])
    .map((r) => (r.counties as { name: string } | null)?.name)
    .filter(Boolean) as string[];

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

      <div className={s.sectionLabel}>Actions</div>
      {blocked === 'history' && (
        <p className={s.blocked}>
          Not deleted. {c.business_name} has quotes, ratings or awarded jobs on file, and those
          carry customer prices and payments. Suspend them instead: it stops every email and
          hides every job, and keeps the history.
        </p>
      )}
      <div className={s.actions}>
        {c.status !== 'approved' && (
          <form action={setContractorStatus}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="approved" />
            <button type="submit" className={s.btnApprove}>
              {c.status === 'suspended' ? 'Reinstate' : 'Approve'}
            </button>
          </form>
        )}
        {c.status === 'approved' && (
          <form action={setContractorStatus}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="suspended" />
            <button type="submit" className={s.btnSuspend}>
              Suspend
            </button>
          </form>
        )}
        <DeleteContractorButton
          id={c.id}
          business={c.business_name}
          pending={c.status === 'pending'}
        />
      </div>
    </div>
  );
}
