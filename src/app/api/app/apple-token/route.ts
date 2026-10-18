import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { APPLE_BUNDLE_ID, storeAppleTokenFromCode } from '@/lib/apple/tokens';

/**
 * After a native Sign in with Apple: the sheet's authorization code, which
 * the app exchanges for a refresh token and keeps so the account can be
 * properly deleted later (lib/apple/tokens.ts). Native codes are issued to
 * the app's bundle id, so that is the client for the exchange.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.slice(0, 2048) : '';
  if (!code) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const ok = await storeAppleTokenFromCode(user.id, code, APPLE_BUNDLE_ID);
  return NextResponse.json({ ok });
}
