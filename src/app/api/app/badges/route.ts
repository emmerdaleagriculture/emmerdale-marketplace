import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getBadges } from '@/lib/app/badges';

/**
 * Counts for the app's tab-bar badges, for the signed-in user only. Polled
 * by AppShell on navigation and when the app returns to the foreground.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  try {
    const badges = await getBadges(user.id);
    return NextResponse.json(badges, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[app/badges] failed:', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
