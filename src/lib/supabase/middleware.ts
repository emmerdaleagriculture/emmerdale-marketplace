import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminEmail } from '@/lib/adminEmails';

/** Signed out, or signed in as someone who is not an admin: to the login page. */
function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase auth session on every request and rewrites the auth
 * cookies onto the response so Server Components see a fresh session. Standard
 * @supabase/ssr middleware pattern. Route protection (redirecting unauthed
 * users) is layered on in later phases; for now this just keeps sessions alive.
 */
export async function updateSession(request: NextRequest) {
  // Fast path: no Supabase auth cookies at all → anonymous visitor, nothing to
  // refresh. Skips a network round-trip to Supabase on every public-page view
  // (protected pages still enforce auth themselves via redirect-to-login).
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-'));
  const adminPath = request.nextUrl.pathname.startsWith('/admin');
  if (!hasAuthCookie) {
    return adminPath ? toLogin(request) : NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and this call — it
  // can cause hard-to-debug session-refresh races.
  //
  // getClaims, not getUser: the project signs tokens with an asymmetric key
  // (ES256, published at /auth/v1/.well-known/jwks.json), so a live token is
  // verified here against the cached key with no call to Supabase Auth. An
  // expired one is still refreshed over the network, which is the one job
  // this middleware has.
  const { data } = await supabase.auth.getClaims();

  // /admin is gated here as well as in its layout. A layout is not re-run on
  // a soft navigation and a crafted RSC request can ask for the page segment
  // alone, so the layout's redirect is not a boundary on its own; this runs
  // on every request to the path. The claims are signature-verified above,
  // so the email in them is the signed-in user's.
  if (adminPath && !isAdminEmail(data?.claims?.email as string | undefined)) {
    // Signed in but not an admin: to their own account, as the layout does;
    // signed out (claims absent or unverifiable): to login.
    if (!data?.claims) return toLogin(request);
    const url = request.nextUrl.clone();
    url.pathname = '/account';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
