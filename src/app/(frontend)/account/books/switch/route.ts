import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { OWN_BOOKS, VIEW_COOKIE } from '@/lib/books/server';
import { sharedLedgers } from '@/lib/books/viewers.server';

export const dynamic = 'force-dynamic';

/**
 * Pick whose books to look at: your own (?to=own) or a set shared with you
 * (?to=<ledger id>). Only a ledger actually shared with you is remembered;
 * anything else falls back to your own.
 */
export async function GET(req: NextRequest) {
  const home = new URL('/account/books', req.nextUrl.origin);
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/account/books', req.nextUrl.origin));
  const to = req.nextUrl.searchParams.get('to') ?? OWN_BOOKS;
  const res = NextResponse.redirect(home);
  const ok = to !== OWN_BOOKS && (await sharedLedgers(user.id)).some((s) => s.ledger.id === to);
  res.cookies.set(VIEW_COOKIE, ok ? to : OWN_BOOKS, { path: '/account/books', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 180 });
  return res;
}
