import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getBadges } from '@/lib/app/badges';
import { booksTabFor } from '@/lib/books/access';

/**
 * Counts for the app's tab-bar badges, for the signed-in user only. Polled
 * by AppShell on navigation and when the app returns to the foreground.
 * `books` says whether the bar carries the Books tab.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  try {
    const [badges, books] = await Promise.all([getBadges(user.id), booksTabFor(user.id, user.email).catch(() => false)]);
    return NextResponse.json({ ...badges, books }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[app/badges] failed:', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
