import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { setContractorStatus } from './actions';
import { DeleteContractorButton } from './DeleteContractorButton';
import s from '../admin.module.css';
import { AdminTable, StatusPill } from '../ui';

export const metadata: Metadata = { title: 'Contractors — Admin' };

/** Both tables on this page are the same table, split by status. */
const COLUMNS = ['Business', 'Contact', 'Email', 'Base', 'Counties', 'Invited', 'Status', 'Actions'];

/**
 * Ticking most of the map is how four contractors came to receive 114
 * invitations between them and open ten. The 40-mile radius now stops the
 * invitations; this is the flag for the conversation about why they ticked
 * Northern Ireland from Leicester.
 */
const MANY_COUNTIES = 30;
/** Invited this often and never opened one: a quiet account, not a lead. */
const QUIET_AFTER = 5;

function ActionButtons({ c }: { c: ContractorRow }) {
  return (
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
      <DeleteContractorButton
        id={c.id}
        business={c.business_name}
        pending={c.status === 'pending'}
      />
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
        {c.counties}
        {c.counties >= MANY_COUNTIES && (
          <>
            {' '}
            <span className={`${s.pill} ${s.pillSuspended}`} title="Covers most of the map — worth a word">
              blanket
            </span>
          </>
        )}
      </td>
      <td>
        {c.invited === 0 ? (
          '—'
        ) : (
          <>
            {c.opened}/{c.invited} opened
            {c.opened === 0 && c.invited >= QUIET_AFTER && (
              <>
                {' '}
                <span className={`${s.pill} ${s.pillSuspended}`} title="Never opened an invitation">
                  quiet
                </span>
              </>
            )}
          </>
        )}
      </td>
      <td>
        <StatusPill status={c.status} />
      </td>
      <td>
        <ActionButtons c={c} />
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
  counties: number;
  invited: number;
  opened: number;
};

export default async function AdminContractorsPage() {
  const admin = createServiceRoleClient();
  // The county coverage read went with the map it fed.
  const [{ data }, { data: outreach }] = await Promise.all([
    admin
      .from('contractors')
      .select('id, business_name, contact_name, email, base_postcode, status, created_at')
      .order('created_at', { ascending: false }),
    // One row per contractor, counted in SQL: reading job_invitations here
    // would hit PostgREST's 1000-row cap and count wrong without saying so.
    admin.from('admin_contractor_outreach').select('contractor_id, counties, invited, opened').limit(10000),
  ]);

  const byId = new Map((outreach ?? []).map((o) => [o.contractor_id, o]));
  const contractors = (data ?? []).map((c) => {
    const o = byId.get(c.id);
    return { ...c, counties: o?.counties ?? 0, invited: o?.invited ?? 0, opened: o?.opened ?? 0 };
  }) as ContractorRow[];
  const pending = contractors.filter((c) => c.status === 'pending');
  const rest = contractors.filter((c) => c.status !== 'pending');

  return (
    <div>
      <h1 className={s.h1}>Contractors</h1>
      <p className={s.sub}>
        {contractors.length} registered · {pending.length} awaiting approval
      </p>
      {/* Was a choropleth of ticked counties. All three maps live on one page
          now, where they can be compared instead of hunted for. */}
      <p className={s.sub}>
        <Link href="/admin/coverage?view=contractors">Contractors by county on the map →</Link>
      </p>

      <div className={s.sectionLabel}>Awaiting approval</div>
      {pending.length === 0 ? (
        <div className={s.empty}>No contractors waiting for approval.</div>
      ) : (
        <AdminTable head={COLUMNS}>
          {pending.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </AdminTable>
      )}

      <div className={s.sectionLabel}>All contractors</div>
      {rest.length === 0 ? (
        <div className={s.empty}>No approved contractors yet.</div>
      ) : (
        <AdminTable head={COLUMNS}>
          {rest.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </AdminTable>
      )}
    </div>
  );
}
