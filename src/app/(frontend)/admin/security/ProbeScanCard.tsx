'use client';

import { useState, useTransition } from 'react';
import { loadClusterIps, resolveAnomaly, type ClusterIp } from './actions';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

/**
 * One scan, as a card. The message is the detector's own sentence; the last
 * clause of it is the one to read first. "No write from this actor
 * succeeded" means RLS held. "A write SUCCEEDED" means open the logs link
 * and look at every table touched before closing this, and never assume it
 * was the attacker's own account: on the site this was ported from, that
 * assumption was wrong and fake notifications had landed in real inboxes.
 *
 * There is deliberately no Block button. The scan hits Supabase's edge, not
 * ours, and a button would promise a defence that does not exist. "Copy IPs"
 * is for a rule somewhere that can act on them.
 */
export function ProbeScanCard({
  id,
  severity,
  message,
  checkFlag,
  clusterKey,
  logsUrl,
  detectedAt,
  updatedAt,
  recentCount,
  resolved,
}: {
  id: number;
  severity: string;
  message: string;
  checkFlag: boolean;
  clusterKey: string | null;
  logsUrl: string | null;
  detectedAt: string;
  updatedAt: string;
  recentCount: number;
  resolved: boolean;
}) {
  const [ips, setIps] = useState<ClusterIp[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, start] = useTransition();

  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (ips || !clusterKey) return;
    start(async () => {
      try {
        setIps(await loadClusterIps(clusterKey));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const copy = async () => {
    if (!ips) return;
    try {
      await navigator.clipboard.writeText(ips.map((r) => r.actor_ip).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr('Could not write to the clipboard.');
    }
  };

  const tone = severity === 'critical' ? s.cardCritical : s.cardWarning;
  return (
    <div className={`${s.card} ${resolved ? s.cardResolved : tone}`}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>Security probe</span>
        <span className={`${s.pill} ${severity === 'critical' ? s.sevCritical : s.sevWarning}`}>{severity}</span>
        <span className={s.cardMeta}>
          {fmt(detectedAt)}
          {recentCount > 1 ? ` · updated ${recentCount} times, last ${fmt(updatedAt)}` : ''}
        </span>
      </div>
      <div className={s.cardBody}>
        {message}
        {checkFlag && !resolved && (
          <span className={s.cardCheck}>
            Open the logs, filter this fingerprint to POST, PATCH, PUT and DELETE with a 2xx, and look at every table
            touched before closing this.
          </span>
        )}
      </div>
      <div className={s.cardActions}>
        {clusterKey && (
          <button type="button" className={f.btnGhost} style={BTN} onClick={toggle} disabled={loading}>
            {loading ? 'Loading…' : open ? 'Hide source IPs' : 'Show source IPs'}
          </button>
        )}
        {ips && ips.length > 0 && (
          <button type="button" className={f.btnGhost} style={BTN} onClick={copy}>
            {copied ? 'Copied' : `Copy ${ips.length} IP${ips.length === 1 ? '' : 's'}`}
          </button>
        )}
        {logsUrl && (
          <a className={f.btnGhost} style={BTN} href={logsUrl} target="_blank" rel="noreferrer">
            Open in Supabase logs
          </a>
        )}
        {!resolved && (
          <form action={resolveAnomaly} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="hidden" name="id" value={id} />
            <input className={f.input} name="resolution" placeholder="Resolution note" style={{ padding: '4px 8px', fontSize: 12, width: 220 }} />
            <button type="submit" className={f.btnGhost} style={BTN}>
              Close
            </button>
          </form>
        )}
      </div>
      {err && <div className={f.error}>{err}</div>}
      {open && ips && (
        <div className={s.tableWrap} style={{ marginTop: 12 }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>IP</th>
                <th>Network</th>
                <th>Requests</th>
                <th>Score</th>
                <th>Paths sampled</th>
                <th>Response</th>
              </tr>
            </thead>
            <tbody>
              {ips.length === 0 && (
                <tr>
                  <td colSpan={6}>No event rows for this cluster: they may have been pruned (90 days).</td>
                </tr>
              )}
              {ips.map((r) => (
                <tr key={r.actor_ip}>
                  <td className={s.mono}>
                    {r.actor_ip}
                    {r.check_flag && <span className={`${s.pill} ${s.sevCritical}`} style={{ marginLeft: 6 }}>wrote</span>}
                  </td>
                  <td>
                    {r.asn_org ?? '—'}
                    {r.country ? ` (${r.country})` : ''}
                  </td>
                  <td>{r.requests}</td>
                  <td>{r.ip_score}</td>
                  <td className={s.mono} style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>
                    {r.paths.slice(0, 6).join('  ')}
                    {r.paths.length > 6 ? ` … +${r.paths.length - 6}` : ''}
                  </td>
                  <td>{r.response_action ?? 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BTN = { padding: '4px 10px', fontSize: 11 } as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
