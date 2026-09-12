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
 * Where a signed-in user without a contractor profile belongs when they open a
 * contractor page. Contractor pages used to send every such user to
 * /onboarding — for a customer, an application form for somebody else's job.
 * Customers go to their own jobs; anyone else (a contractor mid-signup) to
 * onboarding, as before.
 */
export async function nonContractorPath(userId: string): Promise<string> {
  try {
    const { data } = await createServiceRoleClient()
      .from('customers')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    return data ? '/my' : '/onboarding';
  } catch (err) {
    console.error('[auth] customer lookup failed:', err);
    return '/onboarding';
  }
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
 * The rows say what a person CAN be; the chooser says which they came here
 * to be. So the rows constrain and the chooser decides within them:
 *
 *   both rows      → whichever they picked. A contractor who books work
 *                    through the site is one account with two sides, and
 *                    letting the contractor row always win would leave the
 *                    jobs they saved unreachable from the login page.
 *   one row        → that one, whatever they picked. The chooser cannot
 *                    conjure an account that isn't there.
 *   neither row    → whichever they picked, defaulting to contractor: that
 *                    case is a contractor part-way through onboarding
 *                    (/account forwards them to /onboarding), and it is what
 *                    the page did before the chooser existed.
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
    const asCustomer = side === 'customer' ? '/my' : '/account';
    if (contractor.data && customer.data) return asCustomer;
    if (contractor.data) return '/account';
    if (customer.data) return '/my';
    return asCustomer;
  } catch (err) {
    // Never strand someone at a blank page over a failed lookup.
    console.error('[auth] post-login routing lookup failed:', err);
    return '/account';
  }
}
