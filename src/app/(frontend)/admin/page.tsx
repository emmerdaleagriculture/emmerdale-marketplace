import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import s from './admin.module.css';
import f from '@/components/forms/forms.module.css';

export const metadata: Metadata = { title: 'Dashboard — Admin' };

type Metrics = {
  total_jobs: number;
  open_jobs: number;
  claimed_jobs: number;
  withdrawn_jobs: number;
  contractors_total: number;
  contractors_approved: number;
  contractors_pending: number;
};

function Metric({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className={s.metric}>
      <div className={s.metricValue}>{value}</div>
      <div className={s.metricLabel}>{label}</div>
      {hint && <div className={s.metricHint}>{hint}</div>}
    </div>
  );
}

export default async function AdminDashboard() {
  const admin = createServiceRoleClient();
  const { data } = await admin.rpc('admin_metrics');
  const m = (data ?? {}) as Metrics;

  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

  return (
    <div>
      <h1 className={s.h1}>Dashboard</h1>
      <p className={s.sub}>Overview of the network.</p>

      <div className={s.sectionLabel}>Jobs</div>
      <div className={s.metricGrid}>
        <Metric value={num(m.total_jobs)} label="Total jobs" />
        <Metric value={num(m.open_jobs)} label="Open now" />
        <Metric value={num(m.claimed_jobs)} label="Claimed" />
        <Metric value={num(m.withdrawn_jobs)} label="Withdrawn" />
      </div>

      <div className={s.sectionLabel}>Contractors</div>
      <div className={s.metricGrid}>
        <Metric value={num(m.contractors_total)} label="Registered" />
        <Metric value={num(m.contractors_approved)} label="Approved" />
        <Metric value={num(m.contractors_pending)} label="Awaiting approval" />
      </div>

      <div className={s.sectionLabel}>Quick actions</div>
      <div className={s.quickLinks}>
        <Link href="/admin/jobs/new" className={f.btnPrimary}>
          Post a job
        </Link>
        <Link href="/admin/jobs" className={f.btnGhost}>
          All jobs
        </Link>
        <Link href="/admin/contractors" className={f.btnGhost}>
          Contractors{m.contractors_pending ? ` (${m.contractors_pending} pending)` : ''}
        </Link>
        <Link href="/admin/seo" className={f.btnGhost}>
          Search Console
        </Link>
      </div>
    </div>
  );
}
