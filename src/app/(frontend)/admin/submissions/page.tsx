import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import s from '../admin.module.css';

export const metadata: Metadata = { title: 'Submissions — Admin' };

/**
 * Review queue for the /start ads landing page (spec Part 1). Read-only:
 * nothing here feeds the jobs board automatically — this funnel's follow-up
 * is handled off-platform until Part 2 ships.
 *
 * Unmatched and reclassified submissions surface first: they're the most
 * valuable data this page produces — they distinguish genuine gaps in the
 * service taxonomy from a prompt that's simply wrong, and the spec wants them
 * reviewed on a cadence rather than left to accumulate.
 */

type SubmissionRow = {
  id: string;
  created_at: string;
  status: string;
  service_verbatim: string | null;
  service_confirmed: boolean | null;
  area_value: number | null;
  area_unit: string | null;
  postcode: string | null;
  urgency: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  parse_source: string | null;
  raw_text: string;
  service: { name: string } | null;
  county: { name: string } | null;
};

function serviceLabel(r: SubmissionRow) {
  if (r.service) return r.service.name;
  return r.service_verbatim ? `“${r.service_verbatim.slice(0, 40)}”` : '(unmatched)';
}

function areaLabel(r: SubmissionRow) {
  if (r.area_value === null) return '—';
  return `${r.area_value} ${r.area_unit === 'linear_m' ? 'm' : (r.area_unit ?? '')}`;
}

export default async function AdminSubmissionsPage() {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('job_submissions')
    .select(
      'id, created_at, status, service_verbatim, service_confirmed, area_value, area_unit, postcode, urgency, contact_name, contact_phone, parse_source, raw_text, service:services(name), county:counties(name)',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as SubmissionRow[];
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const needsReview = confirmed.filter((r) => !r.service || r.service_confirmed === false);
  const rest = confirmed.filter((r) => r.service && r.service_confirmed !== false);
  const draftCount = rows.filter((r) => r.status !== 'confirmed').length;

  const table = (list: SubmissionRow[]) => (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Service</th>
            <th>Area</th>
            <th>County</th>
            <th>When needed</th>
            <th>Contact</th>
            <th>Parse</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/submissions/${r.id}`}>{serviceLabel(r)}</Link>
                {r.service_confirmed === false && (
                  <>
                    {' '}
                    <span className={`${s.pill} ${s.pillPending}`}>reclassified</span>
                  </>
                )}
                {!r.service && (
                  <>
                    {' '}
                    <span className={`${s.pill} ${s.pillSuspended}`}>unmatched</span>
                  </>
                )}
              </td>
              <td>{areaLabel(r)}</td>
              <td>{r.county?.name ?? '—'}</td>
              <td>{r.urgency ?? '—'}</td>
              <td>
                {r.contact_name ?? '—'}
                {r.contact_phone ? ` · ${r.contact_phone}` : ''}
              </td>
              <td>{r.parse_source === 'deterministic_fallback' ? 'fallback' : (r.parse_source ?? '—')}</td>
              <td>{formatDateTime(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 className={s.h1}>Submissions</h1>
      <p className={s.sub}>
        Jobs described on the ads landing page. {confirmed.length} confirmed
        {draftCount > 0 ? ` · ${draftCount} draft${draftCount === 1 ? '' : 's'} (started, not finished)` : ''}.
      </p>

      <div className={s.sectionLabel}>Needs taxonomy review — unmatched or reclassified</div>
      {needsReview.length === 0 ? (
        <div className={s.empty}>
          Nothing waiting. Submissions land here when the parser matched no
          service, or the customer said the classification was wrong.
        </div>
      ) : (
        table(needsReview)
      )}

      <div className={s.sectionLabel}>Confirmed</div>
      {rest.length === 0 ? (
        <div className={s.empty}>No confirmed submissions yet.</div>
      ) : (
        table(rest)
      )}
    </div>
  );
}
