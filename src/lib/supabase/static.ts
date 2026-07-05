import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Cookie-less Supabase client for PUBLIC reference data (counties, services —
 * world-readable under RLS). Because it never touches cookies(), pages that use
 * it can be statically rendered / ISR-cached at the CDN instead of being forced
 * dynamic. Never use this for user-scoped reads.
 */
export function createStaticClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
