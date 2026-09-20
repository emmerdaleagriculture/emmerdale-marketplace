import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon and common static image types
     * - monitoring, the Sentry tunnel (next.config.mjs, tunnelRoute)
     * This keeps the session fresh across the app without touching assets.
     *
     * The tunnel is excluded because it is not a page: it is where the browser
     * POSTs error reports, including the report for an error thrown by this
     * middleware. Refreshing a Supabase session on each of those would add a
     * round trip to every event and put the session-refresh path inside its
     * own error path.
     */
    '/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
