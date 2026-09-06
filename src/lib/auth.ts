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

/** What the login form's side chooser asked for, when it was asked. */
export type LoginSide = 'customer' | 'contractor' | null;

/**
 * Where a person belongs once they are signed in.
 *
 * One login page serves contractors and customers, so it cannot assume which
 * has arrived. It used to send everyone to /account — the contractor's
 * account — which for a customer is somebody else's front door.
 *
 * Identity is decided by what exists, and that beats what was clicked: a
 * contractors row means contractor, a customers row means customer, and
 * neither of those can be talked out of by the chooser on the form. The
 * chooser only settles the case the rows cannot — somebody with an account
 * and no rows at all, which is a contractor part-way through onboarding
 * (/account forwards them to /onboarding) or a customer who signed up but
 * has not saved a job yet. Defaulting that case to contractor is what the
 * page did before the chooser existed.
 *
 * A ?next= from the email they followed wins over all of it, upstream.
 */
export async function postLoginPath(
  userId: string,
  email: string | null | undefined,
  side: LoginSide = null,
): Promise<string> {
  if (isAdminEmail(email)) return '/admin';
  try {
    const admin = createServiceRoleClient();
    const [contractor, customer] = await Promise.all([
      admin.from('contractors').select('id').eq('id', userId).maybeSingle(),
      admin.from('customers').select('id').eq('id', userId).maybeSingle(),
    ]);
    if (contractor.data) return '/account';
    if (customer.data) return '/my';
    return side === 'customer' ? '/my' : '/account';
  } catch (err) {
    // Never strand someone at a blank page over a failed lookup.
    console.error('[auth] post-login routing lookup failed:', err);
    return '/account';
  }
}
