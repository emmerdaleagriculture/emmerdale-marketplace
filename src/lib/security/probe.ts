/**
 * Display helpers for the Security tab. Pure, so the card's reading of an
 * anomaly row is tested without a database.
 *
 * The detector (supabase/functions/detect-probe-activity) writes a message
 * that ends in `[cluster:<ja4>|<ua>]` so the card can find its events; the
 * tag is for the machine and is stripped before a person reads it.
 */

export const PROJECT_REF = 'wiipzjpqztqjtczeuodp';

export type Severity = 'info' | 'warning' | 'critical';

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** What each rule is, in the words the card uses. */
export const RULE_LABELS: Record<string, string> = {
  probe_scan: 'Security probe',
  probe_detector_blind: 'Probe detector has stopped',
  probe_detector_unscored: 'A span was not scanned',
  anon_writable_rpc: 'Writer RPC with no caller check',
  bucket_active_content: 'Public bucket accepts active content',
  permissive_write_policy: 'Open write policy',
  audit_failed: 'Schema audit did not complete',
};

export function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule.replace(/_/g, ' ');
}

const CLUSTER_TAG = /\s*\[cluster:([^\]]*)\]\s*(\[backfill\])?\s*$/;

/** The message without its machine tag. */
export function stripClusterTag(message: string): string {
  return message.replace(CLUSTER_TAG, '').trim();
}

/** The cluster key a probe_scan message carries, or null for any other row. */
export function parseProbeClusterKey(message: string): string | null {
  const m = CLUSTER_TAG.exec(message);
  return m ? m[1] : null;
}

/** A cluster key is `<ja4>|<lower-cased ua>`. */
export function splitClusterKey(key: string): { ja4: string; ua: string } {
  const i = key.indexOf('|');
  if (i < 0) return { ja4: key, ua: '' };
  return { ja4: key.slice(0, i), ua: key.slice(i + 1) };
}

/** The message said a write succeeded: look before closing. */
export function isCheckFlagged(message: string): boolean {
  return /^CHECK:/.test(message);
}

/**
 * The Supabase Logs Explorer, pre-filtered to one TLS fingerprint over the
 * last 24 hours, so the raw requests behind a card are one click away. The
 * Explorer speaks the BigQuery dialect, not the Analytics endpoint's.
 */
export function probeLogsUrl(ja4: string, ref = PROJECT_REF): string {
  const safe = ja4.replace(/[^A-Za-z0-9_]/g, '');
  const sql = [
    'select id, edge_logs.timestamp, event_message, r.method, r.path, resp.status_code, h.user_agent, h.cf_connecting_ip',
    'from edge_logs',
    'cross join unnest(metadata) as m',
    'cross join unnest(m.request) as r',
    'cross join unnest(r.headers) as h',
    'cross join unnest(r.cf) as cf',
    'cross join unnest(cf.botManagement) as bm',
    'cross join unnest(m.response) as resp',
    `where bm.ja4 = '${safe}'`,
    'order by timestamp desc',
    'limit 200',
  ].join('\n');
  const u = new URL(`https://supabase.com/dashboard/project/${ref}/logs/explorer`);
  u.searchParams.set('q', sql);
  u.searchParams.set('its', new Date(Date.now() - 24 * 3600_000).toISOString());
  u.searchParams.set('ite', new Date().toISOString());
  return u.toString();
}

export type ProbeEventRow = {
  actor_ip: string;
  asn_org: string | null;
  country: string | null;
  requests: number;
  ip_score: number;
  check_flag: boolean;
  detected_at: string;
  top_paths: unknown;
  response_action: string | null;
};

/** One row per IP, newest firing wins; the order is score then requests. */
export function collapseByIp<T extends ProbeEventRow>(rows: T[]): T[] {
  const byIp = new Map<string, T>();
  for (const r of rows) {
    const have = byIp.get(r.actor_ip);
    if (!have || Date.parse(r.detected_at) > Date.parse(have.detected_at)) byIp.set(r.actor_ip, r);
  }
  return [...byIp.values()].sort((a, b) => b.ip_score - a.ip_score || b.requests - a.requests);
}

/** The paths the detector sampled, as strings whatever JSON shape they arrived in. */
export function pathsOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export type DetectorState = {
  last_success_end?: string | null;
  last_success_at?: string | null;
  last_window_start?: string | null;
  last_failure_at?: string | null;
  last_failure_detail?: string | null;
  consecutive_failures?: number | null;
  catchup_failures?: number | null;
  last_actors_seen?: number | null;
  last_clusters?: number | null;
  last_persist_error?: string | null;
};

export type Heartbeat = { label: string; bad: boolean; detail: string | null };

/** The one line the tile says about the detector. */
export function heartbeatVerdict(state: DetectorState | null, now = Date.now()): Heartbeat {
  if (!state || !state.last_success_end) {
    const fails = state?.consecutive_failures ?? 0;
    return {
      label: fails ? 'never succeeded' : 'never run',
      bad: true,
      detail: state?.last_failure_detail ?? 'No firing has completed. Check the detect-probe-activity cron and the MGMT_API_TOKEN secret.',
    };
  }
  const ageMin = Math.round((now - Date.parse(state.last_success_end)) / 60_000);
  if (ageMin > 60) {
    return {
      label: `stopped ${ageMin >= 120 ? `${Math.round(ageMin / 60)}h` : `${ageMin}m`} ago`,
      bad: true,
      detail: state.last_failure_detail ?? null,
    };
  }
  const fails = state.consecutive_failures ?? 0;
  if (fails > 0) {
    return { label: `${fails} failure${fails === 1 ? '' : 's'} since last success`, bad: false, detail: state.last_failure_detail ?? null };
  }
  return { label: 'scanning', bad: false, detail: null };
}
