import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  SEVERITY_ORDER,
  heartbeatVerdict,
  isCheckFlagged,
  parseProbeClusterKey,
  probeLogsUrl,
  splitClusterKey,
  stripClusterTag,
  type DetectorState,
  type Severity,
} from '@/lib/security/probe';
import s from '../admin.module.css';
import { AdminTable, Tile, Tiles, ago } from '../ui';
import { AnomalyCard, fmt } from './AnomalyCard';
import { ProbeScanCard } from './ProbeScanCard';
import { DetectorControls } from './DetectorControls';
import { AddProbeAllowlist } from './AllowlistForms';
import { removeProbeAllowlist } from './actions';

export const metadata: Metadata = { title: 'Security · Admin' };
export const dynamic = 'force-dynamic';

/**
 * Was the site scanned, by whom, and did anything get in.
 *
 * A penetration test against a Supabase site is ~350 requests from ~70 IPs
 * at 5 to 9 each: invisible to any per-IP threshold, invisible to anything
 * in front of the website because it hits Supabase's edge directly, and
 * absent from every table because almost all of it is 404s. The detector
 * reads the API-gateway log every 15 minutes, clusters actors by TLS
 * fingerprint, and raises one card per cluster. This page is where those
 * cards are read, and where the detector's own pulse is checked, because
 * "nothing found" and "nothing running" look identical everywhere else.
 */
export default async function SecurityPage() {
  const admin = createServiceRoleClient();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [openQ, resolvedQ, stateQ, eventsQ, allowQ] = await Promise.all([
    admin
      .from('security_anomalies')
      .select('id, stream, rule, severity, message, detected_at, updated_at, recent_count')
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(200),
    admin
      .from('security_anomalies')
      .select('id, rule, severity, message, detected_at, updated_at, recent_count, resolved_at, resolution')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', since14d)
      .order('resolved_at', { ascending: false })
      .limit(50),
    admin.from('app_config').select('value, updated_at').eq('key', 'probe_detector_state').maybeSingle(),
    admin.from('security_probe_events').select('actor_ip, backfill').gte('detected_at', since7d).limit(1000),
    admin.from('security_probe_allowlist').select('cidr, reason, added_at, added_by').order('added_at'),
  ]);

  // A failed read must not render as an all-clear: an empty security page
  // that is actually blind is the most dangerous page in the admin.
  for (const [what, q] of [
    ['security_anomalies', openQ],
    ['resolved anomalies', resolvedQ],
    ['the heartbeat', stateQ],
    ['security_probe_events', eventsQ],
    ['the allowlist', allowQ],
  ] as const) {
    if (q.error) throw new Error(`Could not read ${what}: ${q.error.message}`);
  }

  const open = (openQ.data ?? []).sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity as Severity] ?? 9) - (SEVERITY_ORDER[b.severity as Severity] ?? 9) ||
      Date.parse(b.detected_at) - Date.parse(a.detected_at),
  );
  const criticals = open.filter((a) => a.severity === 'critical').length;
  const state = (stateQ.data?.value ?? null) as DetectorState | null;
  const pulse = heartbeatVerdict(state);
  const events = eventsQ.data ?? [];
  const liveIps = new Set(events.filter((e) => !e.backfill).map((e) => e.actor_ip)).size;
  const allIps = new Set(events.map((e) => e.actor_ip)).size;

  return (
    <div>
      <h1 className={s.h1}>Security</h1>
      <p className={s.sub}>
        Who scanned the API, as one cluster rather than seventy IPs, and whether any write got through. The
        detector reads the Supabase gateway log every 15 minutes; a critical card is emailed within the hour,
        the rest wait for the 07:00 digest. The weekly schema audit is on{' '}
        <Link href="/admin/security/audit">its own page</Link>. Nothing here can block anyone: the scan hits
        Supabase&rsquo;s edge, not ours, and the defence is RLS and the caller guards the audit checks.
      </p>

      <Tiles>
        <Tile value={open.length} label="Open findings" hint={criticals ? `${criticals} critical` : 'none critical'} warn={criticals > 0} />
        <Tile value={pulse.label} label="Detector" hint={state?.last_success_end ? `last scan to ${fmt(state.last_success_end)}` : 'no scan completed'} warn={pulse.bad} />
        <Tile value={allIps} label="Scanning IPs, 7 days" hint={allIps !== liveIps ? `${liveIps} live, ${allIps - liveIps} from backfill` : 'from live firings'} />
        <Tile value={state?.last_actors_seen ?? '—'} label="Actors last scan" hint={`${state?.last_clusters ?? 0} over the floor`} />
      </Tiles>

      <div className={s.sectionLabel}>Open findings</div>
      {open.length === 0 ? (
        <div className={s.empty}>
          Nothing open. {pulse.bad ? <strong>But the detector is not running, so this is not an all-clear.</strong> : 'The detector is running, so this does mean no scan has crossed the floor.'}
        </div>
      ) : (
        open.map((a) => {
          if (a.rule !== 'probe_scan') {
            return (
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
            );
          }
          const key = parseProbeClusterKey(a.message);
          return (
            <ProbeScanCard
              key={a.id}
              id={a.id}
              severity={a.severity}
              message={stripClusterTag(a.message)}
              checkFlag={isCheckFlagged(a.message)}
              clusterKey={key}
              logsUrl={key ? probeLogsUrl(splitClusterKey(key).ja4) : null}
              detectedAt={a.detected_at}
              updatedAt={a.updated_at}
              recentCount={a.recent_count}
              resolved={false}
            />
          );
        })
      )}

      <div className={s.sectionLabel}>The detector</div>
      <div className={s.detailGrid}>
        <div>
          <div className={s.dLabel}>Last successful scan</div>
          <div className={s.dValue}>
            {state?.last_success_end ? `${fmt(state.last_window_start ?? state.last_success_end)} to ${fmt(state.last_success_end)}` : 'never'}
            {state?.last_success_at ? <span className={s.metricHint}> · finished {ago(state.last_success_at)}</span> : null}
          </div>
        </div>
        <div>
          <div className={s.dLabel}>Failures since</div>
          <div className={s.dValue}>
            {state?.consecutive_failures ?? 0}
            {state?.last_failure_at ? <span className={s.metricHint}> · last {ago(state.last_failure_at)}</span> : null}
          </div>
        </div>
        <div>
          <div className={s.dLabel}>Last error</div>
          <div className={`${s.dValue} ${s.mono}`}>{state?.last_failure_detail ?? pulse.detail ?? 'none'}</div>
        </div>
        <div>
          <div className={s.dLabel}>Last write problem</div>
          <div className={`${s.dValue} ${s.mono}`}>{state?.last_persist_error ?? 'none'}</div>
        </div>
      </div>
      <DetectorControls />
      <p className={s.metricHint} style={{ marginTop: 10 }}>
        Fires at :07, :22, :37 and :52 and reads the previous 30 minutes. The watchdog at :29 raises a critical if
        no scan has succeeded for an hour; a span the detector could not reach is a warning naming the exact
        times, and the fix is a backfill. Before trusting the alerts, backfill the last fortnight a day at a
        time and check that nothing real scored.
      </p>

      <div className={s.sectionLabel}>Ranges that never score</div>
      <p className={s.metricHint} style={{ marginBottom: 10 }}>
        Our own edge functions and the known crawlers are already excluded by user agent and network. This is
        for an office, a home, or a CI runner that probes the site on purpose. Empty is the right state until
        one of those exists.
      </p>
      {(allowQ.data ?? []).length > 0 && (
        <AdminTable head={['Range', 'Reason', 'Added', '']}>
          {(allowQ.data ?? []).map((r) => (
            <tr key={r.cidr}>
              <td className={s.mono}>{r.cidr}</td>
              <td>{r.reason}</td>
              <td>
                {fmt(r.added_at)}
                {r.added_by ? <div className={s.metricHint}>{r.added_by}</div> : null}
              </td>
              <td>
                <form action={removeProbeAllowlist}>
                  <input type="hidden" name="cidr" value={r.cidr} />
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
        <AddProbeAllowlist />
      </div>

      <div className={s.sectionLabel}>Closed in the last 14 days</div>
      {(resolvedQ.data ?? []).length === 0 ? (
        <div className={s.empty}>Nothing closed recently.</div>
      ) : (
        <AdminTable head={['Finding', 'Severity', 'Raised', 'Closed', 'Resolution']}>
          {(resolvedQ.data ?? []).map((a) => (
            <tr key={a.id}>
              <td style={{ maxWidth: 520 }}>
                <strong>{a.rule.replace(/_/g, ' ')}</strong>
                <div className={s.metricHint} style={{ overflowWrap: 'anywhere' }}>{stripClusterTag(a.message)}</div>
              </td>
              <td>
                <span className={`${s.pill} ${a.severity === 'critical' ? s.sevCritical : a.severity === 'warning' ? s.sevWarning : s.sevInfo}`}>{a.severity}</span>
              </td>
              <td>{fmt(a.detected_at)}</td>
              <td>{a.resolved_at ? fmt(a.resolved_at) : '—'}</td>
              <td>{a.resolution ?? '—'}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
