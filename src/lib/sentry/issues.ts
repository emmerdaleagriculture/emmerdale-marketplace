import { SENTRY_DSN } from './options';

/**
 * Reading issues back out of Sentry, for the admin error page.
 *
 * This is the only place the app talks to Sentry's API rather than its ingest
 * endpoint, and it needs a real credential to do it — SENTRY_AUTH_TOKEN, the
 * same org token that uploads source maps, which is emphatically not the DSN.
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

export async function loadSentryIssues(limit = 25): Promise<SentryIssues> {
  const token = process.env.SENTRY_AUTH_TOKEN;
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
          ? 'the token was rejected — it may have been revoked'
          : res.status === 403
            ? // The expected outcome for a source-map token, and worth saying
              // precisely: the one Sentry's UI offers for uploading releases
              // carries project:releases and no read scope at all, so it
              // uploads fine and cannot list a single issue. 403 here means
              // the token works and is not allowed to read, which is a
              // different problem from 401 and has a different fix.
              'the token has no read scope — uploading source maps needs ' +
              'project:releases, but listing issues also needs org:read ' +
              '(a token can have both; the release-only one does not)'
            : res.status === 404
              ? `no project ${ORG}/${PROJECT} in the ${apiBase()} region`
              : `Sentry answered ${res.status}`;
      return { configured: true, ok: false, error: detail };
    }
    const raw: RawIssue[] = await res.json();
    return {
      configured: true,
      ok: true,
      issues: raw.map((i) => ({
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
      })),
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : 'could not reach Sentry',
    };
  }
}
