import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for use in Client Components (browser). Reads the public
 * URL + anon key; all access is governed by RLS, so the anon key is safe to
 * ship to the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
