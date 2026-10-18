import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Bookkeeping around phone verification (PRD task 5): the resend timer, the
 * wrong-code lockout, and what to write where once a number is verified.
 * The verifying itself is Supabase Auth's (updateUser + verifyOtp
 * phone_change); see supabase/migrations/20261018120000_app_phone_verification.sql.
 */
export {
  RESEND_AFTER_S,
  MAX_FAILURES,
  LOCKOUT_MINUTES,
  lockedMinutes,
  resendWaitSeconds,
  maskEmail,
  type PhoneVerification,
} from './phoneRules';
import { LOCKOUT_MINUTES, MAX_FAILURES, maskEmail, type PhoneVerification } from './phoneRules';

export async function getVerification(userId: string): Promise<PhoneVerification | null> {
  const { data } = await createServiceRoleClient()
    .from('phone_verifications')
    .select('phone, last_sent_at, failures, locked_until, verified_at, match_user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function setVerification(userId: string, patch: Partial<PhoneVerification>): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from('phone_verifications')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.error('[phone] verification upsert failed:', error);
}

/**
 * A wrong code: one more failure, and the fifth locks the number for ten
 * minutes. Returns what to tell the person.
 */
export async function recordFailure(userId: string, v: PhoneVerification | null): Promise<string> {
  const failures = (v?.failures ?? 0) + 1;
  if (failures >= MAX_FAILURES) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
    await setVerification(userId, { failures: 0, locked_until: until });
    return `That's ${MAX_FAILURES} wrong codes. For safety, try again in ${LOCKOUT_MINUTES} minutes.`;
  }
  await setVerification(userId, { failures });
  const left = MAX_FAILURES - failures;
  return `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_MINUTES}-minute wait.`;
}

/**
 * The number is verified: write it to whichever profile rows exist, stamp
 * when, and clear the counters. Customers and contractors keep the number
 * in the same columns the rest of the site already reads (customers.phone,
 * contractors.phone), so nothing downstream — texts, the masking rules,
 * what a booked contractor sees — changes.
 */
export async function recordVerifiedPhone(userId: string, phone: string): Promise<void> {
  const admin = createServiceRoleClient();
  const at = new Date().toISOString();
  await Promise.all([
    admin.from('customers').update({ phone, phone_verified_at: at }).eq('id', userId),
    admin.from('contractors').update({ phone, phone_verified_at: at }).eq('id', userId),
    setVerification(userId, { phone, verified_at: at, failures: 0, locked_until: null }),
  ]);
}

export type PhoneMatch = { userId: string; emailMasked: string; kind: 'customer' | 'contractor' };

/**
 * Another account that has verified the same number — the Apple "Hide My
 * Email" case, where the relay address matched nothing at sign-in and the
 * phone is the only thing that can. Only ever offered, never acted on
 * without the person saying yes (match screen).
 */
export async function findPhoneMatch(userId: string, phone: string): Promise<PhoneMatch | null> {
  const admin = createServiceRoleClient();
  const [c, k] = await Promise.all([
    admin.from('customers').select('id, email').eq('phone', phone).not('phone_verified_at', 'is', null).neq('id', userId).limit(1).maybeSingle(),
    admin.from('contractors').select('id, email').eq('phone', phone).not('phone_verified_at', 'is', null).neq('id', userId).limit(1).maybeSingle(),
  ]);
  const hit = k.data ? { ...k.data, kind: 'contractor' as const } : c.data ? { ...c.data, kind: 'customer' as const } : null;
  if (!hit) return null;
  return { userId: hit.id, emailMasked: maskEmail(hit.email), kind: hit.kind };
}

/**
 * Whether the signed-in account is empty enough to be set aside in favour
 * of the matched one: no jobs, no contractor profile. A fresh Apple sign-in
 * is; anything with history is not, and the two stay separate.
 */
export async function isEmptyAccount(userId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const [contractor, jobs] = await Promise.all([
    admin.from('contractors').select('id').eq('id', userId).maybeSingle(),
    admin.from('job_submissions').select('id', { count: 'exact', head: true }).eq('customer_id', userId),
  ]);
  return !contractor.data && (jobs.count ?? 0) === 0;
}
