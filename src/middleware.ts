import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Only the routes whose server side reads the session. The refresh here
     * exists so Server Components see a live token; a page that never reads
     * one gains nothing from it, and on Vercel middleware runs before the
     * CDN cache, so until 2026-10-01 a signed-in contractor opening the
     * home page or a county page paid a Supabase Auth round trip for a page
     * that was already cached. The browser client keeps its own token fresh
     * on those pages (useViewer).
     *
     * Public, token-addressed and static routes are left out on purpose:
     * /, /notes, the service and county pages, /quote/[token], the legal
     * pages. /my/[token] is in because it reads the session to offer "save
     * to your account"; /start because its actions do. /api/stripe reads the
     * session; /api/track and the Sentry tunnel (/monitoring) do not.
     */
    '/(account|admin|app|auth|invitations|jobs|login|my|onboarding|reset-password|signup|start|won)(/.*)?',
    '/api/stripe/(.*)',
  ],
};
