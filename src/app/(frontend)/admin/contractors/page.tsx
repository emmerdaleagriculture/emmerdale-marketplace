import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCountyCoverage } from '@/lib/reference';
import { setContractorStatus } from './actions';
import { CoverageMap } from './CoverageMap';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Contractors — Admin' };

const pillClass: Record<string, string> = {
  pending: s.pillPending,
  approved: s.pillApproved,
  suspended: s.pillSuspended,
};

function StatusPill({ status }: { status: string }) {
  return <span className={`${s.pill} ${pillClass[status] ?? ''}`}>{status}</span>;
}

function ActionButtons({ id, status }: { id: string; status: string }) {
  return (
    <div className={s.actions}>
      {status !== 'approved' && (
        <form action={setContractorStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="approved" />
          <button type="submit" className={s.btnApprove}>
            Approve
          </button>
        </form>
      )}
      {status !== 'suspended' && (
        <form action={setContractorStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="suspended" />
          <button type="submit" className={s.btnSuspend}>
            Suspend
          </button>
        </form>
      )}
    </div>
  );
}

function Row({ c }: { c: ContractorRow }) {
  return (
    <tr>
      <td>
        <Link href={`/admin/contractors/${c.id}`}>{c.business_name}</Link>
      </td>
      <td>{c.contact_name}</td>
      <td>{c.email}</td>
      <td>{c.base_postcode}</td>
      <td>
        <StatusPill status={c.status} />
      </td>
      <td>
        <ActionButtons id={c.id} status={c.status} />
      </td>
    </tr>
  );
}

type ContractorRow = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  base_postcode: string;
  status: string;
  created_at: string;
};

export default async function AdminContractorsPage() {
  const admin = createServiceRoleClient();
  const [{ data }, coverageCounts] = await Promise.all([
    admin
      .from('contractors')
      .select('id, business_name, contact_name, email, base_postcode, status, created_at')
      .order('created_at', { ascending: false }),
    getCountyCoverage(),
  ]);

  const contractors = (data ?? []) as ContractorRow[];
  const pending = contractors.filter((c) => c.status === 'pending');
  const rest = contractors.filter((c) => c.status !== 'pending');

  return (
    <div>
      <h1 className={s.h1}>Contractors</h1>
      <p className={s.sub}>
        {contractors.length} registered · {pending.length} awaiting approval
      </p>

      <CoverageMap counts={coverageCounts} />

      <div className={s.sectionLabel}>Awaiting approval</div>
      {pending.length === 0 ? (
        <div className={s.empty}>No contractors waiting for approval.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Business</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Base</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </tbody>
          </table>
        </div>
      )}

      <div className={s.sectionLabel}>All contractors</div>
      {rest.length === 0 ? (
        <div className={s.empty}>No approved or suspended contractors yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
          <thead>
            <tr>
              <th>Business</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Base</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
