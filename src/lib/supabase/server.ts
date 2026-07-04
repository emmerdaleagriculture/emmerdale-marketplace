import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Wires Supabase's auth cookies through Next's cookie store so sessions
 * persist. Governed by RLS via the anon key + the signed-in user's JWT.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component — safe to ignore when
            // middleware is refreshing the session (see lib/supabase/middleware).
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Server-only. Use ONLY in admin routes
 * and trusted server code; never expose the service-role key to the browser.
 */
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY is not set — required for service-role access.',
    );
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
