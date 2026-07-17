import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Google Search Console client — OAuth web-server flow.
 *
 * Ported from the Hampshire Paddock Management admin. Why OAuth and not a
 * service account: GCP's default org policy `iam.disableServiceAccountKeyCreation`
 * blocks service-account JSON keys. OAuth uses an admin's own Google account that
 * already has Search Console access, so no extra grant is needed in GSC either.
 *
 * Setup:
 *   1. GCP Console → APIs & Services → Credentials → Create OAuth client ID →
 *      Web application.
 *   2. Authorised redirect URIs:
 *        http://localhost:3000/admin/seo/auth/callback   (dev)
 *        https://emmerdaleagriculture.com/admin/seo/auth/callback (prod)
 *   3. Env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GSC_SITE_URL
 *      (GSC_SITE_URL is the exact property string in Search Console, e.g.
 *      "https://emmerdaleagriculture.com/" or "sc-domain:emmerdaleagriculture.com").
 *   4. Visit /admin/seo/auth/connect once and grant access.
 *
 * The refresh token is stored in the `gsc_auth` table (service-role only) and
 * used to mint access tokens on demand.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'openid',
  'email',
].join(' ');

let cachedToken: { value: string; expiresAt: number } | null = null;

export type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDimension = 'query' | 'page' | 'date' | 'country' | 'device' | 'searchAppearance';

export type GscQueryArgs = {
  startDate: string;
  endDate: string;
  dimensions?: GscDimension[];
  rowLimit?: number;
};

export function isGscOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GSC_SITE_URL,
  );
}

export function buildOAuthRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/admin/seo/auth/callback`;
}

export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: buildOAuthRedirectUri(origin),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  origin: string,
): Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: buildOAuthRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`OAuth code exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  if (!json.refresh_token) {
    throw new Error(
      'No refresh_token returned. Re-grant with prompt=consent — Google only returns one on a fresh consent.',
    );
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresIn: json.expires_in,
  };
}

/** Look up the email associated with an access token (for display). */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

async function getAccessTokenFromRefresh(refreshToken: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

async function getStoredRefreshToken(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('gsc_auth')
    .select('refresh_token')
    .eq('id', true)
    .maybeSingle();
  return data?.refresh_token ?? null;
}

/** Persist a freshly granted refresh token (called by the OAuth callback). */
export async function storeRefreshToken(
  refreshToken: string,
  connectedEmail: string | null,
): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.from('gsc_auth').upsert({
    id: true,
    refresh_token: refreshToken,
    connected_email: connectedEmail,
    connected_at: new Date().toISOString(),
  });
  cachedToken = null; // force a fresh access token off the new refresh token
}

export async function getConnectedEmail(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('gsc_auth')
    .select('connected_email')
    .eq('id', true)
    .maybeSingle();
  return data?.connected_email ?? null;
}

export async function isGscConnected(): Promise<boolean> {
  if (!isGscOAuthConfigured()) return false;
  return Boolean(await getStoredRefreshToken());
}

export async function gscQuery(args: GscQueryArgs): Promise<GscRow[]> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error('GSC_SITE_URL not set');

  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error('Not connected — visit /admin/seo/auth/connect');

  const token = await getAccessTokenFromRefresh(refreshToken);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: args.startDate,
      endDate: args.endDate,
      dimensions: args.dimensions ?? [],
      rowLimit: args.rowLimit ?? 25,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}

/** YYYY-MM-DD, n days before today (UTC). */
export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
