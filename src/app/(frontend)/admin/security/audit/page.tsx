import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import s from '../../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../../ui';
import { AnomalyCard, fmt } from '../AnomalyCard';
import { RunAuditButton } from '../RunAuditButton';
import { AddAuditAllowlist } from '../AllowlistForms';
import { removeAuditAllowlist } from '../actions';

export const metadata: Metadata = { title: 'Schema audit · Admin' };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { rpc: 'RPC', bucket_mime: 'Bucket MIME', policy: 'Policy' };

/**
 * Layer 0: find the holes before somebody else does.
 *
 * The scans this system is built for got in, where they got in, through
 * three shapes of mistake: a SECURITY DEFINER function anyone can call that
 * writes without asking who is calling; a public bucket that will store and
 * serve an SVG or an HTML file; a write policy that is `true` or merely
 * "signed in", which is the same thing when anyone can sign up. Each is a
 * catalog query, so each is checked every Monday and a card is raised for
 * anything not on the reviewed list. The detector on the Security page tells
 * you that you were scanned; this tells you what would have given.
 */
export default async function SecurityAuditPage() {
  const admin = createServiceRoleClient();
  const [openQ, resolvedQ, allowQ, cronQ] = await Promise.all([
    admin
      .from('security_anomalies')
      .select('id, rule, severity, message, detected_at, updated_at, recent_count')
      .eq('stream', 'security_audit')
      .is('resolved_at', null)
      .order('detected_at', { ascending: false }),
    admin
      .from('security_anomalies')
      .select('id, rule, severity, message, detected_at, updated_at, recent_count, resolved_at, resolution')
      .eq('stream', 'security_audit')
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(20),
    admin.from('security_audit_allowlist').select('kind, item, reason, reviewed_at, reviewed_by').order('kind').order('item'),
    admin.rpc('cron_jobs_health'),
  ]);
  for (const [what, q] of [
    ['open audit findings', openQ],
    ['closed audit findings', resolvedQ],
    ['the audit allowlist', allowQ],
  ] as const) {
    if (q.error) throw new Error(`Could not read ${what}: ${q.error.message}`);
  }

  const auditJob = ((cronQ.data ?? []) as { jobname: string; last_start: string | null; last_status: string | null }[]).find(
    (j) => j.jobname === 'security-audit',
  );
  const open = openQ.data ?? [];
  const allow = allowQ.data ?? [];

  return (
    <div>
      <h1 className={s.h1}>Schema audit</h1>
      <p className={s.sub}>
        What a scanner would get through, checked against the live catalog every Monday: writer RPCs anyone can
        call that never ask who is calling, public buckets that would serve script or markup, and write policies
        open to any account. A finding is fixed, or accepted here with a reason. The scan detector is on{' '}
        <Link href="/admin/security">the Security page</Link>.
      </p>

      <Tiles>
        <Tile value={open.length} label="Open findings" hint="each card is one class of hole" warn={open.length > 0} />
        <Tile value={allow.length} label="Accepted items" hint="reviewed, with a reason" />
        <Tile
          value={auditJob?.last_start ? ago(auditJob.last_start) : cronQ.error ? '—' : 'never'}
          label="Last weekly run"
          hint={auditJob?.last_status ? `pg_cron: ${auditJob.last_status}` : 'Mondays 05:47 UTC'}
          warn={auditJob?.last_status === 'failed'}
        />
      </Tiles>

      <div className={s.sectionLabel}>Findings</div>
      {open.length === 0 ? (
        <div className={s.empty}>
          Nothing open: no writer RPC without a caller check, no public bucket serving active content, no write
          policy that any account could use. Run it again after a migration that adds a function, a bucket or a
          policy.
        </div>
      ) : (
        open.map((a) => (
          <AnomalyCard
            key={a.id}
            id={a.id}
            rule={a.rule}
            severity={a.severity}
            message={a.message}
            detectedAt={a.detected_at}
            updatedAt={a.updated_at}
            recentCount={a.recent_count}
          />
        ))
      )}
      <div style={{ marginTop: 12 }}>
        <RunAuditButton />
      </div>

      <div className={s.sectionLabel}>Accepted findings</div>
      <p className={s.metricHint} style={{ marginBottom: 10 }}>
        An item here stops raising. Remove it and the next run raises it again. Paste the item exactly as the
        card lists it: for an RPC that is its signature, for a bucket <code>bucket:mime</code> (or{' '}
        <code>bucket:*</code> for one that accepts anything), for a policy <code>table.policy (CMD)</code>.
      </p>
      {allow.length > 0 && (
        <AdminTable head={['Kind', 'Item', 'Reason', 'Reviewed', '']}>
          {allow.map((r) => (
            <tr key={`${r.kind}:${r.item}`}>
              <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
              <td className={s.mono} style={{ overflowWrap: 'anywhere' }}>{r.item}</td>
              <td>{r.reason}</td>
              <td>
                {fmt(r.reviewed_at)}
                {r.reviewed_by ? <div className={s.metricHint}>{r.reviewed_by}</div> : null}
              </td>
              <td>
                <form action={removeAuditAllowlist}>
                  <input type="hidden" name="kind" value={r.kind} />
                  <input type="hidden" name="item" value={r.item} />
                  <button type="submit" className={s.btnSuspend} style={{ padding: '3px 8px', fontSize: 11 }}>
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      <div style={{ marginTop: 10 }}>
        <AddAuditAllowlist />
      </div>

      {(resolvedQ.data ?? []).length > 0 && (
        <>
          <div className={s.sectionLabel}>Closed</div>
          {(resolvedQ.data ?? []).map((a) => (
            <AnomalyCard
              key={a.id}
              id={a.id}
              rule={a.rule}
              severity={a.severity}
              message={a.message}
              detectedAt={a.detected_at}
              updatedAt={a.updated_at}
              recentCount={a.recent_count}
              resolvedAt={a.resolved_at}
              resolution={a.resolution}
            />
          ))}
        </>
      )}
    </div>
  );
}
