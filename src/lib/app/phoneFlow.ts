import type { User } from '@supabase/supabase-js';
import { safeInternalPath } from '@/lib/auth';
import { roleIntent } from '@/lib/app/landing';

/** The confirmed number on the auth user, as +44…, or null. Supabase stores it without the plus. */
export function confirmedAuthPhone(user: Pick<User, 'phone' | 'phone_confirmed_at'> | null | undefined): string | null {
  if (!user?.phone || !user.phone_confirmed_at) return null;
  return `+${user.phone.replace(/^\+/, '')}`;
}

/**
 * Where a person goes once the phone step is done: back to the page the
 * gate stopped (never the phone screens themselves), or on through
 * /app/continue with the role they chose on the welcome screen.
 */
export function afterPhoneStep(formData: FormData): string {
  const next = safeInternalPath(String(formData.get('next') || ''));
  if (next && !next.startsWith('/app/phone')) return next;
  const role = roleIntent(String(formData.get('role') || ''));
  return role ? `/app/continue?role=${role}` : '/app/continue';
}

/** The same two values carried on to the match screen's URL. */
export function phoneStepQuery(formData: FormData): string {
  const next = safeInternalPath(String(formData.get('next') || ''));
  const role = roleIntent(String(formData.get('role') || ''));
  const q = new URLSearchParams();
  if (next) q.set('next', next);
  if (role) q.set('role', role);
  const s = q.toString();
  return s ? `?${s}` : '';
}
