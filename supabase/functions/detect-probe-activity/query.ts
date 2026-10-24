// The ClickHouse query against the Supabase Analytics API, and the URL it
// travels in.
//
// The only place a scan is visible is the API-gateway log (`edge_logs`). It is
// not reachable from Postgres, so the detector reads it through the Management
// API's analytics endpoint. Every field lives in the `log_attributes` map; the
// status code is a 3-character string, whose lexical order matches numeric
// order for HTTP codes, so it is compared as a string throughout.
//
// The aggregation happens here, in SQL, so the result set is one row per
// actor with a handful of counters rather than every request in the window.
// An actor is (client IP, JA4 TLS fingerprint, user agent).
//
// Two constraints shape the SQL:
//   - It travels as a GET parameter. ~8.5 KB worked, ~11 KB answered 414, so
//     each marker list is folded into ONE multiSearchAny() needle array and a
//     unit test pins the built URL under 7 KB.
//   - ClickHouse quirks on this endpoint, each learned by a 502: match(),
//     multiMatchAny() and toUInt16OrZero() fail with a bare "Backend error";
//     a leading WITH is a parser error; a SELECT alias used inside an
//     aggregate must also be in GROUP BY, so expressions are inlined.
//     multiSearchAny (max 255 needles), like, position, startsWith, uniqIf
//     and countIf work. Every marker literal is single-quote-escaped because
//     the SQL-injection markers contain apostrophes.

import { ACTIVE_CONTENT_SUFFIXES, PAYLOAD_MARKERS } from './payload.ts';

/** The Supabase project whose gateway log is read. */
export const PROJECT_REF = 'wiipzjpqztqjtczeuodp';

/**
 * Functions nobody but our own scheduler and Twilio should ever call. A
 * 401/403 here is a stranger knocking, not a user failing. Internal functions
 * that answer 403 to strangers belong on this list; without it their refusals
 * read as user-facing errors.
 */
export const ADMIN_FNS: readonly string[] = [
  '/functions/v1/send-emails',
  '/functions/v1/sms-events',
  '/functions/v1/detect-probe-activity',
];

/** The URL has to fit in a GET. 7 KB leaves headroom under the ~11 KB wall. */
export const URL_BUDGET_BYTES = 7 * 1024;

/** The Analytics endpoint returns short results on windows much over 8 h. */
export const MAX_ACTORS = 500;

export type ActorRow = {
  ip: string;
  ja4: string;
  ua: string;
  asn_org: string;
  country: string;
  total: number;
  fourxx: number;
  fn404_distinct: number;
  rest_enum: number;
  rpc404_distinct: number;
  admin_denied: number;
  payload_hits: number;
  storage_active: number;
  write2xx: number;
  distinct_paths: number;
  sample_paths: string[];
  first_seen: string;
  last_seen: string;
};

const A = (k: string) => `log_attributes['${k}']`;
const IP = A('request.headers.cf_connecting_ip');
const JA4 = A('request.cf.botManagement.ja4');
const UA = A('request.headers.user_agent');
const ORG = A('request.cf.asOrganization');
const COUNTRY = A('request.cf.country');
const PATH = A('request.path');
const SEARCH = A('request.search');
const METHOD = A('request.method');
const STATUS = A('response.status_code');

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const needles = (xs: readonly string[]) => `[${xs.map(q).join(', ')}]`;
const inList = (xs: readonly string[]) => `(${xs.map(q).join(', ')})`;

/** The aggregate per actor. One row per (ip, ja4, ua) with any suspicious counter > 0. */
export function buildQuery(adminFns: readonly string[] = ADMIN_FNS): string {
  const is404 = `${STATUS} = '404'`;
  const is4xx = `${STATUS} >= '400' and ${STATUS} < '500'`;
  const is2xx = `${STATUS} >= '200' and ${STATUS} < '300'`;
  const denied = `(${STATUS} = '401' or ${STATUS} = '403')`;
  const fnPath = `startsWith(${PATH}, '/functions/v1/')`;
  const restPath = `startsWith(${PATH}, '/rest/v1/')`;
  const rpcPath = `startsWith(${PATH}, '/rest/v1/rpc/')`;
  const storagePath = `startsWith(${PATH}, '/storage/v1/object/')`;
  const url = `lower(concat(${PATH}, ${SEARCH}))`;
  const isWrite = `${METHOD} in ('POST', 'PATCH', 'PUT', 'DELETE')`;

  return [
    'select',
    `${IP} as ip,`,
    `${JA4} as ja4,`,
    `${UA} as ua,`,
    `any(${ORG}) as asn_org,`,
    `any(${COUNTRY}) as country,`,
    'count() as total,',
    `countIf(${is4xx}) as fourxx,`,
    `uniqIf(${PATH}, ${is404} and ${fnPath}) as fn404_distinct,`,
    `uniqIf(${PATH}, ${is404} and ${restPath} and not ${rpcPath}) as rest_enum,`,
    `uniqIf(${PATH}, ${is404} and ${rpcPath}) as rpc404_distinct,`,
    `countIf(${denied} and ${PATH} in ${inList(adminFns)}) as admin_denied,`,
    `uniqIf(${url}, multiSearchAny(${url}, ${needles(PAYLOAD_MARKERS)})) as payload_hits,`,
    `countIf(${METHOD} in ('POST', 'PUT') and ${storagePath} and multiSearchAny(lower(${PATH}), ${needles(ACTIVE_CONTENT_SUFFIXES)})) as storage_active,`,
    `countIf(${isWrite} and ${restPath} and not ${rpcPath} and ${is2xx}) as write2xx,`,
    `uniq(${PATH}) as distinct_paths,`,
    `arraySlice(groupUniqArray(${PATH}), 1, 10) as sample_paths,`,
    'min(timestamp) as first_seen,',
    'max(timestamp) as last_seen',
    `from logs where source = 'edge_logs' and ${METHOD} != 'OPTIONS'`,
    'group by ip, ja4, ua',
    'having fourxx > 0 or payload_hits > 0 or storage_active > 0 or admin_denied > 0',
    `order by total desc limit ${MAX_ACTORS}`,
  ].join(' ');
}

/** The GET URL for one window. Both bounds are required by the endpoint. */
export function buildUrl(start: Date, end: Date, sql = buildQuery(), ref = PROJECT_REF): string {
  const u = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  u.searchParams.set('iso_timestamp_start', start.toISOString());
  u.searchParams.set('iso_timestamp_end', end.toISOString());
  u.searchParams.set('sql', sql);
  return u.toString();
}

/** The analytics timestamps come back without a zone and are UTC. */
export function parseAnalyticsTime(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
}

/** Coerce one result row: numbers arrive as numbers, but a missing map key is ''. */
export function coerceRow(r: Record<string, unknown>): ActorRow {
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return {
    ip: s(r.ip),
    ja4: s(r.ja4),
    ua: s(r.ua),
    asn_org: s(r.asn_org),
    country: s(r.country),
    total: n(r.total),
    fourxx: n(r.fourxx),
    fn404_distinct: n(r.fn404_distinct),
    rest_enum: n(r.rest_enum),
    rpc404_distinct: n(r.rpc404_distinct),
    admin_denied: n(r.admin_denied),
    payload_hits: n(r.payload_hits),
    storage_active: n(r.storage_active),
    write2xx: n(r.write2xx),
    distinct_paths: n(r.distinct_paths),
    sample_paths: Array.isArray(r.sample_paths) ? r.sample_paths.map(s) : [],
    first_seen: s(r.first_seen),
    last_seen: s(r.last_seen),
  };
}
