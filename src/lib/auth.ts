import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
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

/**
 * Where a person belongs once they are signed in.
 *
 * One login page serves contractors and customers, so it cannot assume which
 * has arrived. It used to send everyone to /account — the contractor's
 * account — which for a customer is somebody else's front door.
 *
 * Identity is decided by what exists rather than by what was typed, and the
 * order matters. A contractors row makes you a contractor. Failing that, a
 * customers row makes you a customer. Anyone with neither goes the contractor
 * way, because that is what they almost certainly are: a contractor who
 * signed up and has not finished onboarding has no contractors row yet, and
 * /account sends them on to /onboarding. Routing them by absence would drop
 * every new contractor into the customer area on their first login.
 *
 * A ?next= from the email they followed still wins over all of it.
 */
export async function postLoginPath(userId: string, email: string | null | undefined): Promise<string> {
  if (isAdminEmail(email)) return '/admin';
  try {
    const admin = createServiceRoleClient();
    const [contractor, customer] = await Promise.all([
      admin.from('contractors').select('id').eq('id', userId).maybeSingle(),
      admin.from('customers').select('id').eq('id', userId).maybeSingle(),
    ]);
    if (contractor.data) return '/account';
    if (customer.data) return '/my';
    return '/account';
  } catch (err) {
    // Never strand someone at a blank page over a failed lookup.
    console.error('[auth] post-login routing lookup failed:', err);
    return '/account';
  }
}
