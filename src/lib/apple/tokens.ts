import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Sign in with Apple's token endpoints, for account deletion (PRD task 10).
 * Apple requires an app that offers Sign in with Apple to revoke the user's
 * tokens when they delete their account. Revoking needs a refresh token,
 * which only the authorization-code exchange yields, so that exchange is
 * done once at sign-in and the refresh token kept (apple_tokens).
 *
 * Secrets (Vercel): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the
 * .p8 contents; newlines may be escaped as \n), APPLE_SERVICES_ID (the web
 * client), APPLE_BUNDLE_ID (defaults to the app's).
 */
const TEAM_ID = (process.env.APPLE_TEAM_ID ?? '').trim();
const KEY_ID = (process.env.APPLE_KEY_ID ?? '').trim();
const PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
export const APPLE_SERVICES_ID = (process.env.APPLE_SERVICES_ID ?? process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? '').trim();
export const APPLE_BUNDLE_ID = (process.env.APPLE_BUNDLE_ID ?? 'com.emmerdaleagriculture.app').trim();

export function appleConfigured(): boolean {
  return Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The client secret Apple wants: a short-lived ES256 JWT signed with the .p8 key. */
export function appleClientSecret(clientId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: TEAM_ID, iat: now, exp: now + 600, aud: 'https://appleid.apple.com', sub: clientId }),
  );
  const key = createPrivateKey(PRIVATE_KEY);
  // JWTs carry the raw r||s signature, not DER.
  const sig = cryptoSign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(sig)}`;
}

async function appleAuth(path: 'token' | 'revoke', form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  let body: Record<string, unknown> = {};
  try {
    body = await r.json();
  } catch {}
  return { status: r.status, body };
}

/**
 * Exchange the authorization code from a native sign-in for Apple's tokens,
 * and keep the refresh token for a later revoke. Best effort: a failure here
 * must never fail the sign-in itself.
 */
export async function storeAppleTokenFromCode(userId: string, code: string, clientId: string): Promise<boolean> {
  if (!appleConfigured() || !code) return false;
  try {
    const { status, body } = await appleAuth('token', {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: appleClientSecret(clientId),
    });
    const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : null;
    if (status !== 200 || !refresh) {
      console.error('[apple] code exchange failed:', status, body.error ?? '');
      return false;
    }
    return storeAppleRefreshToken(userId, refresh, clientId);
  } catch (err) {
    console.error('[apple] code exchange threw:', err);
    return false;
  }
}

/** A refresh token Supabase handed back after the web OAuth flow. */
export async function storeAppleRefreshToken(userId: string, refreshToken: string, clientId: string): Promise<boolean> {
  const { error } = await createServiceRoleClient().from('apple_tokens').upsert(
    { user_id: userId, refresh_token: refreshToken, client_id: clientId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) console.error('[apple] token not stored:', error.message);
  return !error;
}

/**
 * Revoke what we hold for this user. Returns whether Apple confirmed it;
 * "nothing held" counts as done, because there is nothing to revoke.
 */
export async function revokeAppleTokens(userId: string): Promise<{ revoked: boolean; held: boolean }> {
  const admin = createServiceRoleClient();
  const { data } = await admin.from('apple_tokens').select('refresh_token, client_id').eq('user_id', userId).maybeSingle();
  if (!data) return { revoked: true, held: false };
  if (!appleConfigured()) return { revoked: false, held: true };
  try {
    const { status, body } = await appleAuth('revoke', {
      client_id: data.client_id,
      client_secret: appleClientSecret(data.client_id),
      token: data.refresh_token,
      token_type_hint: 'refresh_token',
    });
    if (status !== 200) {
      console.error('[apple] revoke failed:', status, body.error ?? '');
      return { revoked: false, held: true };
    }
    await admin.from('apple_tokens').delete().eq('user_id', userId);
    return { revoked: true, held: true };
  } catch (err) {
    console.error('[apple] revoke threw:', err);
    return { revoked: false, held: true };
  }
}
