import { SENTRY_DSN } from './options';

/**
 * Reading issues back out of Sentry, for the admin error page.
 *
 * This is the only place the app talks to Sentry's API rather than its ingest
 * endpoint, and it needs a real credential to do it — emphatically not the DSN.
 *
 * That credential is SENTRY_READ_TOKEN, deliberately its own variable rather
 * than a second use of SENTRY_AUTH_TOKEN. The two want opposite things and
 * cannot be satisfied by one token from Sentry's UI: the build needs to write
 * releases, this needs to read events, and an organization token — the kind
 * the Sentry UI offers first — has fixed scopes that cover the former and
 * never the latter. Reading issues therefore means a second token, and giving
 * it its own name keeps a read credential from being handed to the build, or
 * a build credential from being widened until it can read.
 *
 * The fallback to SENTRY_AUTH_TOKEN is for the case where someone has
 * deliberately issued one token that does both; it costs nothing and means a
 * single-token setup keeps working.
 *
 * It is allowed to be absent. Without a token this returns `configured: false`
 * and the page says so plainly, because an error dashboard that renders an
 * empty list when it simply cannot see anything is worse than one that admits
 * it: the first reads as "no errors".
 */

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  type: string | null;
  value: string | null;
  level: string | null;
  count: number;
  userCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  permalink: string | null;
};

export type SentryIssues =
  | { configured: false }
  | { configured: true; ok: true; issues: SentryIssue[] }
  | { configured: true; ok: false; error: string };

const ORG = process.env.SENTRY_ORG || 'emmerdale-agriculture-ltd';
const PROJECT = process.env.SENTRY_PROJECT || 'javascript-nextjs';

/**
 * Sentry's API is region-hosted and an EU org is not reachable on the US host
 * — it answers 404, which reads exactly like a wrong project slug. The region
 * is already in the DSN (…ingest.de.sentry.io), so take it from there rather
 * than adding a second setting that can disagree with the first.
 */
function apiBase(): string {
  const region = SENTRY_DSN?.match(/ingest\.([a-z]{2})\.sentry\.io/)?.[1];
  return region ? `https://${region}.sentry.io/api/0` : 'https://sentry.io/api/0';
}

type RawIssue = {
  id?: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  count?: string | number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink?: string;
  metadata?: { type?: string; value?: string };
};

function shapeIssue(i: RawIssue): SentryIssue {
  return {
    id: String(i.id ?? ''),
    shortId: i.shortId ?? '',
    title: i.title ?? '(untitled)',
    culprit: i.culprit ?? null,
    type: i.metadata?.type ?? null,
    value: i.metadata?.value ?? null,
    level: i.level ?? null,
    count: Number(i.count ?? 0),
    userCount: Number(i.userCount ?? 0),
    firstSeen: i.firstSeen ?? null,
    lastSeen: i.lastSeen ?? null,
    permalink: i.permalink ?? null,
  };
}

export async function loadSentryIssues(limit = 25): Promise<SentryIssues> {
  const token = process.env.SENTRY_READ_TOKEN || process.env.SENTRY_AUTH_TOKEN;
  if (!token) return { configured: false };

  const url =
    `${apiBase()}/projects/${ORG}/${PROJECT}/issues/` +
    `?statsPeriod=14d&query=${encodeURIComponent('is:unresolved')}&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Sentry is a third party on the render path of an admin page. A minute
      // of staleness is fine; a page that waits on them every load is not.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail =
        res.status === 401
          ? 'the token was rejected (it may have been revoked)'
          : res.status === 403
            ? // The expected outcome for a build token, and worth naming the
              // scope exactly, because the obvious guess is wrong. Listing
              // issues needs `event:read` — not `org:read`, which an
              // organization token already has and which still 403s here.
              // Following that guess produces another token that cannot read.
              //
              // 403 means the token is valid and not allowed to read, a
              // different problem from 401 with a different fix. Organization
              // tokens have fixed scopes, so the fix is always a new token of
              // another kind, not an edit to this one.
              'the token is valid but cannot read events: listing issues ' +
              'needs the event:read scope, which an organization token does ' +
              'not have and cannot be given. Issue an internal-integration ' +
              'or personal token with Issue & Event: Read and set it as ' +
              'SENTRY_READ_TOKEN'
            : res.status === 404
              ? `no project ${ORG}/${PROJECT} in the ${apiBase()} region`
              : `Sentry answered ${res.status}`;
      return { configured: true, ok: false, error: detail };
    }
    const raw: RawIssue[] = await res.json();
    return {
      configured: true,
      ok: true,
      issues: raw.map(shapeIssue),
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : 'could not reach Sentry',
    };
  }
}

/** One issue's most recent event, cut down to what diagnoses it. */
export type SentryFrame = {
  file: string | null;
  fn: string | null;
  line: number | null;
  col: number | null;
  inApp: boolean;
};
export type SentryException = { type: string | null; value: string | null; frames: SentryFrame[] };
export type SentryCrumb = { at: string | null; category: string | null; message: string | null; level: string | null };
export type SentryTagCount = { key: string; values: { value: string; count: number }[] };
export type SentryEventDetail = {
  id: string;
  at: string | null;
  url: string | null;
  release: string | null;
  tags: { key: string; value: string }[];
  exceptions: SentryException[];
  breadcrumbs: SentryCrumb[];
  /** contexts + extra, as sent (already scrubbed on the way in). */
  raw: Record<string, unknown>;
};
export type SentryIssueDetail =
  | { configured: false }
  | { configured: true; ok: false; error: string }
  | {
      configured: true;
      ok: true;
      issue: SentryIssue;
      event: SentryEventDetail | null;
      /** Across every event of the issue: which pages, browsers, releases. */
      spread: SentryTagCount[];
    };

const SPREAD_KEYS = ['url', 'browser', 'os', 'device', 'release', 'transaction'];

async function sentryGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Sentry answered ${res.status} for ${path.split('?')[0]}`);
  return res.json();
}

type RawFrame = { filename?: string; absPath?: string; function?: string; lineNo?: number; colNo?: number; inApp?: boolean };
type RawEntry = { type?: string; data?: { values?: unknown[] } };
type RawEvent = {
  eventID?: string;
  id?: string;
  dateCreated?: string;
  release?: { version?: string } | string | null;
  tags?: { key?: string; value?: string }[];
  entries?: RawEntry[];
  contexts?: Record<string, unknown>;
  context?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

function shapeEvent(e: RawEvent): SentryEventDetail {
  const tags = (e.tags ?? []).map((t) => ({ key: String(t.key ?? ''), value: String(t.value ?? '') }));
  const entries = e.entries ?? [];
  const exceptions: SentryException[] = [];
  const breadcrumbs: SentryCrumb[] = [];
  for (const entry of entries) {
    if (entry.type === 'exception') {
      for (const v of (entry.data?.values ?? []) as { type?: string; value?: string; stacktrace?: { frames?: RawFrame[] } }[]) {
        exceptions.push({
          type: v.type ?? null,
          value: v.value ?? null,
          // Sentry lists frames oldest first; the throw is the last one.
          frames: (v.stacktrace?.frames ?? []).slice().reverse().map((f) => ({
            file: f.absPath ?? f.filename ?? null,
            fn: f.function ?? null,
            line: f.lineNo ?? null,
            col: f.colNo ?? null,
            inApp: Boolean(f.inApp),
          })),
        });
      }
    } else if (entry.type === 'breadcrumbs') {
      for (const b of (entry.data?.values ?? []) as { timestamp?: string; category?: string; message?: string; level?: string; data?: Record<string, unknown> }[]) {
        breadcrumbs.push({
          at: b.timestamp ?? null,
          category: b.category ?? null,
          message: b.message ?? (b.data ? JSON.stringify(b.data) : null),
          level: b.level ?? null,
        });
      }
    }
  }
  const release = typeof e.release === 'string' ? e.release : e.release?.version ?? null;
  return {
    id: String(e.eventID ?? e.id ?? ''),
    at: e.dateCreated ?? null,
    url: tags.find((t) => t.key === 'url')?.value ?? null,
    release,
    tags,
    exceptions,
    breadcrumbs: breadcrumbs.slice(-20),
    raw: { contexts: e.contexts ?? {}, extra: e.extra ?? e.context ?? {} },
  };
}

/**
 * One issue in full for /admin/errors/[id]: the issue row, its latest event
 * (stack, breadcrumbs, the page and browser it came from) and how its events
 * spread across pages, browsers and releases. Needs the same event:read token
 * as the list.
 */
export async function loadSentryIssueDetail(id: string): Promise<SentryIssueDetail> {
  const token = process.env.SENTRY_READ_TOKEN || process.env.SENTRY_AUTH_TOKEN;
  if (!token) return { configured: false };
  if (!/^\d+$/.test(id)) return { configured: true, ok: false, error: 'not a Sentry issue id' };
  const base = `/organizations/${ORG}/issues/${id}`;
  try {
    const [rawIssue, rawEvent, rawTags] = await Promise.all([
      sentryGet(`${base}/`, token) as Promise<RawIssue>,
      (sentryGet(`${base}/events/latest/`, token) as Promise<RawEvent>).catch(() => null),
      (sentryGet(`${base}/tags/`, token) as Promise<{ key?: string; topValues?: { value?: string; count?: number }[] }[]>).catch(() => []),
    ]);
    const spread = (rawTags ?? [])
      .filter((t) => t.key && SPREAD_KEYS.includes(t.key))
      .sort((a, b) => SPREAD_KEYS.indexOf(a.key!) - SPREAD_KEYS.indexOf(b.key!))
      .map((t) => ({
        key: t.key!,
        values: (t.topValues ?? []).slice(0, 8).map((v) => ({ value: String(v.value ?? ''), count: Number(v.count ?? 0) })),
      }));
    return {
      configured: true,
      ok: true,
      issue: shapeIssue(rawIssue),
      event: rawEvent ? shapeEvent(rawEvent) : null,
      spread,
    };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : 'could not reach Sentry' };
  }
}
