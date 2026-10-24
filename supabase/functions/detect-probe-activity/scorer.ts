// Turning aggregated actors into clusters with a severity.
//
// Pure and I/O-free, so it is unit-tested against real aggregates without a
// network. Three stages: exclude what is ours or a known crawler, score each
// actor, then sum actors into clusters keyed by TLS fingerprint and user
// agent, so a spray from seventy IPs reads as one actor rather than seventy
// sub-threshold ones. That was the whole lesson of the scan this was built
// after: 5 to 9 requests per IP, and every per-IP threshold slept.
//
// Distinct-count signals are capped so one noisy actor cannot run away; the
// count signals on admin functions and storage uploads are not, because one
// of those is already an attack.

import type { ActorRow } from './query.ts';

export type Severity = 'warning' | 'critical';

export const CRITICAL_AT = 25;
export const WARNING_AT = 12;

/** Our own callers: edge functions, pg_net, PostgREST's own fetches. */
export const DEFAULT_INTERNAL_UA: readonly string[] = [
  'supabaseedgeruntime',
  'pg_net',
  'postgrest',
  'node-fetch/deno',
];

/** Networks whose 404s on stale sitemaps and old URLs are background noise. */
export const DEFAULT_CRAWLER_ORG: readonly string[] = [
  'google',
  'microsoft',
  'bing',
  'meta platforms',
  'facebook',
  'amazonbot',
  'applebot',
  'reflection',
];

/** Tooling nobody browses a marketplace with. */
export const SCANNER_UA: readonly string[] = [
  'curl/',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'wget/',
  'libwww-perl',
  'java/',
  'okhttp',
  'nikto',
  'sqlmap',
  'nmap',
  'masscan',
  'zgrab',
  'nuclei',
  'httpx',
  'dirbuster',
  'gobuster',
  'ffuf',
  'wfuzz',
  'feroxbuster',
  'nessus',
  'acunetix',
  'burp',
  'owasp',
  'scanner',
];

export type Weights = { each: number; cap: number | null };
export const WEIGHTS = {
  fn404_distinct: { each: 3, cap: 30 },
  rest_enum: { each: 2, cap: 30 },
  rpc404_distinct: { each: 2, cap: 20 },
  admin_denied: { each: 4, cap: null },
  payload_hits: { each: 10, cap: 50 },
  storage_active: { each: 10, cap: null },
  scanner_4xx: { each: 5, cap: 5 },
} as const satisfies Record<string, Weights>;

export type SignalName = keyof typeof WEIGHTS;

export type ScoredActor = ActorRow & {
  score: number;
  signals: Partial<Record<SignalName, number>>;
};

export type Cluster = {
  key: string;
  ja4: string;
  ua: string;
  label: string;
  score: number;
  severity: Severity;
  checkFlag: boolean;
  message: string;
  actors: ScoredActor[];
  requests: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
};

export type ScorerOptions = {
  /** CIDRs that never score: home, office, CI egress. */
  allowlistCidrs?: readonly string[];
  internalUa?: readonly string[];
  crawlerOrgs?: readonly string[];
  /** Parses the analytics timestamps; injected so the scorer owns no I/O. */
  parseTime?: (s: string) => Date;
};

// ── Exclusions ───────────────────────────────────────────────────────────────

/** IPv4 CIDR containment; a non-CIDR entry is an exact address match. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  if (bitsStr === undefined) return ip === net;
  const a = ipv4(ip);
  const b = ipv4(net);
  if (a === null || b === null) return ip === net;
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

function ipv4(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255) return null;
    n = ((n << 8) | o) >>> 0;
  }
  return n;
}

export function isExcluded(row: ActorRow, opts: ScorerOptions): boolean {
  const ua = row.ua.toLowerCase();
  if ((opts.internalUa ?? DEFAULT_INTERNAL_UA).some((m) => ua.includes(m))) return true;
  const org = row.asn_org.toLowerCase();
  if ((opts.crawlerOrgs ?? DEFAULT_CRAWLER_ORG).some((m) => org.includes(m))) return true;
  if ((opts.allowlistCidrs ?? []).some((c) => ipInCidr(row.ip, c))) return true;
  return false;
}

export function isScannerUa(ua: string): boolean {
  const s = ua.toLowerCase();
  return SCANNER_UA.some((m) => s.includes(m));
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const capped = (n: number, w: Weights) => (w.cap === null ? n * w.each : Math.min(n * w.each, w.cap));

export function scoreActor(row: ActorRow): ScoredActor {
  const signals: Partial<Record<SignalName, number>> = {};
  let score = 0;
  const add = (name: SignalName, count: number) => {
    if (count <= 0) return;
    const pts = capped(count, WEIGHTS[name]);
    signals[name] = pts;
    score += pts;
  };
  add('fn404_distinct', row.fn404_distinct);
  add('rest_enum', row.rest_enum);
  add('rpc404_distinct', row.rpc404_distinct);
  add('admin_denied', row.admin_denied);
  add('payload_hits', row.payload_hits);
  add('storage_active', row.storage_active);
  // curl alone is not guilt; curl plus errors is a hint. 4xx alone never scores.
  if (row.fourxx > 0 && isScannerUa(row.ua)) add('scanner_4xx', 1);
  return { ...row, score, signals };
}

// ── Clustering ───────────────────────────────────────────────────────────────

/** JA4 + lower-cased UA. Never the ASN: one scan spans many reseller networks. */
export function clusterKey(row: ActorRow): string {
  const ua = row.ua.toLowerCase().replace(/[\[\]]/g, '').slice(0, 80);
  return `${row.ja4 || 'noja4'}|${ua}`;
}

/** "curl/8.5.0", "Mozilla/5.0", "python-requests/2.31": the first token. */
export function shortUa(ua: string): string {
  const t = ua.trim();
  if (!t) return 'no user agent';
  const first = t.split(/\s+/)[0];
  return first.length > 40 ? `${first.slice(0, 37)}...` : first;
}

export function severityFor(score: number): Severity | null {
  if (score >= CRITICAL_AT) return 'critical';
  if (score >= WARNING_AT) return 'warning';
  return null;
}

function fmtHm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function describeSignals(actors: ScoredActor[]): string {
  const sum = (k: keyof ActorRow) => actors.reduce((n, a) => n + (a[k] as number), 0);
  const parts: string[] = [];
  const fn = sum('fn404_distinct');
  const tables = sum('rest_enum');
  const rpcs = sum('rpc404_distinct');
  const admin = sum('admin_denied');
  const payload = sum('payload_hits');
  const storage = sum('storage_active');
  if (fn) parts.push(plural(fn, 'unknown function name'));
  if (tables) parts.push(plural(tables, 'table probe'));
  if (rpcs) parts.push(plural(rpcs, 'unknown RPC name'));
  if (admin) parts.push(plural(admin, 'refused call to admin functions', 'refused calls to admin functions'));
  if (payload) parts.push(plural(payload, 'injection/traversal string'));
  if (storage) parts.push(plural(storage, 'active-content upload'));
  if (!parts.length && actors.some((a) => a.signals.scanner_4xx)) parts.push('scanner tooling with errors');
  return parts.join(', ');
}

export function buildLabel(actors: ScoredActor[]): string {
  const orgs = new Map<string, number>();
  for (const a of actors) {
    const k = a.asn_org || 'unknown network';
    orgs.set(k, (orgs.get(k) ?? 0) + a.total);
  }
  const [topOrg] = [...orgs.entries()].sort((x, y) => y[1] - x[1])[0];
  const top = actors.find((a) => (a.asn_org || 'unknown network') === topOrg)!;
  const where = top.country ? `${topOrg} (${top.country})` : topOrg;
  const ua = shortUa(actors[0].ua);
  return orgs.size > 1 ? `${orgs.size} networks incl. ${where}, ${ua}` : `${where}, ${ua}`;
}

export function scoreActors(rows: ActorRow[], opts: ScorerOptions = {}): Cluster[] {
  const parseTime = opts.parseTime ?? ((s: string) => new Date(s));
  const groups = new Map<string, ScoredActor[]>();
  for (const row of rows) {
    if (isExcluded(row, opts)) continue;
    const scored = scoreActor(row);
    // Only already-suspicious actors reach clustering, so a shared JA4 cannot
    // pull an innocent browser into a cluster.
    if (scored.score <= 0) continue;
    const key = clusterKey(row);
    const list = groups.get(key) ?? [];
    list.push(scored);
    groups.set(key, list);
  }

  const clusters: Cluster[] = [];
  for (const [key, actors] of groups) {
    const score = actors.reduce((n, a) => n + a.score, 0);
    const severity = severityFor(score);
    if (!severity) continue;
    actors.sort((a, b) => b.score - a.score || b.total - a.total);

    const times = actors.flatMap((a) => [a.first_seen, a.last_seen]).filter(Boolean).map(parseTime)
      .filter((d) => !Number.isNaN(d.getTime()));
    const firstSeen = times.length ? new Date(Math.min(...times.map((d) => d.getTime()))) : null;
    const lastSeen = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
    const requests = actors.reduce((n, a) => n + a.total, 0);
    const checkFlag = actors.some((a) => a.write2xx > 0);
    const label = buildLabel(actors);

    const span = firstSeen && lastSeen
      ? ` over ${fmtDuration(lastSeen.getTime() - firstSeen.getTime())} (${fmtHm(firstSeen)} to ${fmtHm(lastSeen)} UTC)`
      : '';
    const signals = describeSignals(actors);
    const verdict = checkFlag
      ? 'A write from this actor SUCCEEDED, check exactly what it changed before closing this.'
      : 'No write from this actor succeeded.';
    const message =
      `${checkFlag ? 'CHECK: ' : ''}Scan from ${label}: ${plural(actors.length, 'IP')}, ` +
      `${plural(requests, 'request')}${span}${signals ? `: ${signals}` : ''}. ${verdict} [cluster:${key}]`;

    clusters.push({
      key,
      ja4: actors[0].ja4,
      ua: actors[0].ua,
      label,
      score,
      severity,
      checkFlag,
      message,
      actors,
      requests,
      firstSeen,
      lastSeen,
    });
  }
  return clusters.sort((a, b) => b.score - a.score);
}
