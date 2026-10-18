import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The app's device registry (PRD task 7). POST {token, platform,
 * app_version} on every app open records or refreshes this device for the
 * signed-in user; POST {token, revoke: true} on sign-out forgets it. A token
 * that moves to another account (two people, one phone) is re-owned, not
 * duplicated: the token is the key.
 */
const Register = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['ios', 'android', 'web']).default('web'),
  app_version: z.string().max(40).nullish(),
  revoke: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const parsed = Register.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const d = parsed.data;
  const admin = createServiceRoleClient();

  if (d.revoke) {
    const { error } = await admin
      .from('device_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', d.token)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from('device_tokens').upsert(
    {
      token: d.token,
      user_id: user.id,
      platform: d.platform,
      app_version: d.app_version ?? null,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'token' },
  );
  if (error) {
    console.error('[device-token] upsert failed:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Whether this user has any live device: the Account screen's toggle state. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { count } = await createServiceRoleClient()
    .from('device_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null);
  return NextResponse.json({ devices: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
