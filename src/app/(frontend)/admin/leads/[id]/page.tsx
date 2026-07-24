import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NewJobForm } from '../../jobs/new/NewJobForm';
import { dismissLeadAction } from '../actions';
import { getCounties, getServices } from '@/lib/reference';
import { tidyJobHint, leadServiceIds } from '@/lib/leads';
import { formatDateTime } from '@/lib/time';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'Review lead — Admin' };

export default async function LeadReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: lead } = await admin.from('leads').select('*').eq('id', id).maybeSingle();
  if (!lead) notFound();
  if (lead.status === 'converted' && lead.job_id) redirect(`/admin/jobs/${lead.job_id}`);

  const [services, counties] = await Promise.all([getServices(), getCounties()]);

  const firstName = lead.full_name.split(/\s+/)[0];
  const cleanHint = tidyJobHint(lead.job_hint);
  // County auto-resolved from the postcode when the enquiry was submitted.
  const details = lead.details as { county?: string | null; county_id?: number | null } | null;
  const detectedCounty = details?.county ?? null;
  const detectedCountyId = details?.county_id ?? undefined;

  return (
    <div>
      <Link href="/admin/leads" className={s.back}>
        ← All leads
      </Link>
      <h1 className={s.h1}>{lead.full_name}</h1>
      <p className={s.sub}>
        {lead.source} lead · received {formatDateTime(lead.created_at)}
      </p>

      <div className={s.detailGrid}>
        <div>
          <div className={s.dLabel}>Phone</div>
          <div className={s.dValue}>{lead.phone ?? '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Email</div>
          <div className={s.dValue}>{lead.email ?? '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Postcode</div>
          <div className={s.dValue}>{lead.postcode ?? '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>County (auto-detected)</div>
          <div className={s.dValue}>{detectedCounty ?? '—'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Wants</div>
          <div className={s.dValue}>{cleanHint ?? '—'}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className={s.dLabel}>Raw form payload</div>
          <div className={s.dValue}>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--ink-2)' }}>
              {JSON.stringify(lead.details, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <div className={s.sectionLabel}>Publish as a job</div>
      <p className={s.sub}>
        The listing will show the first name, the postcode district, the job and
        its details. Surname and contact stay private until the job is claimed.
        Confirm consent before publishing.
      </p>
      <NewJobForm
        services={services}
        counties={counties}
        leadId={lead.id}
        defaults={{
          customer_name: lead.full_name,
          customer_first_name: firstName,
          customer_phone: lead.phone ?? '',
          customer_email: lead.email ?? '',
          postcode: lead.postcode ?? '',
          description: cleanHint ?? '',
          service_ids: leadServiceIds(lead.source, services),
          county_id: detectedCountyId,
        }}
      />

      <div className={s.sectionLabel}>Or</div>
      <form action={dismissLeadAction}>
        <input type="hidden" name="id" value={lead.id} />
        <button type="submit" className={s.btnSuspend}>
          Dismiss this lead
        </button>
      </form>
    </div>
  );
}
