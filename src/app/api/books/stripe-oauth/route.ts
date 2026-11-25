import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireBooksWriter } from '@/lib/books/server';
import { linkExistingAccount, oauthReady, OAUTH_COOKIE } from '@/lib/books/stripeConnect';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/books/stripe-oauth — where Stripe sends the owner of an existing
 * Stripe account after they agree (or don't) to link it to their books. The
 * state must be the one set in their cookie when they pressed the button, and
 * the account goes onto the books of whoever is signed in.
 */
export async function GET(request: NextRequest) {
  const back = (outcome: string) => {
    const res = NextResponse.redirect(`${siteUrl()}/account/books/settings?stripe=${outcome}#card-payments`);
    res.cookies.set(OAUTH_COOKIE, '', { path: '/api/books/stripe-oauth', maxAge: 0 });
    return res;
  };
  const q = request.nextUrl.searchParams;
  const expected = request.cookies.get(OAUTH_COOKIE)?.value;
  const state = q.get('state');
  if (!oauthReady() || !expected || !state || state !== expected) return back('link-failed');
  if (q.get('error')) return back(q.get('error') === 'access_denied' ? 'link-cancelled' : 'link-failed');
  const code = q.get('code');
  if (!code) return back('link-failed');
  const gate = await requireBooksWriter();
  if (!gate.ok || !gate.ledger) return back('link-failed');
  try {
    const r = await linkExistingAccount(gate.ledger, code);
    if (!r.ok) return back(/already linked/.test(r.error) ? 'link-taken' : 'link-failed');
  } catch (err) {
    console.error('[books] stripe link failed', { ledger: gate.ledger.id, error: err instanceof Error ? err.message : err });
    return back('link-failed');
  }
  revalidatePath('/account/books', 'layout');
  return back('linked');
}
