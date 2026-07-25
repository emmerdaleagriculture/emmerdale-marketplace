import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export type Contractor = Database['public']['Tables']['contractors']['Row'];

/** The signed-in Supabase auth user, or null. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Admin gating (spec §7.1, §12.5). We gate admin routes on the server-side
 * ADMIN_EMAILS allowlist rather than a JWT claim: it's simpler, needs no
 * claim-stamping dance, and admin DB writes use the service-role client anyway.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/**
 * Validate a post-login return path (`/login?next=…`). Only same-site relative
 * paths pass — anything else (absolute URLs, protocol-relative `//host`,
 * backslash tricks) would turn the login page into an open redirect.
 */
export function safeInternalPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}

/** The current user's contractor profile row, or null if none exists yet. */
export async function getContractor(): Promise<Contractor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return data ?? null;
}
