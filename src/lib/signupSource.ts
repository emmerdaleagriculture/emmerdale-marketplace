/**
 * Contractor sign-up attribution (contractors.signup_source): which landing
 * page and which ad brought them. Built from the sign-up form, carried on
 * the auth user's metadata, written at onboarding.
 *
 * The metadata is the user's own to rewrite before onboarding reads it, so it
 * is never trusted as-is: only known keys, only strings, clipped.
 */
export const SIGNUP_SOURCE_KEYS = [
  'landing',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'gclid',
  'referrer',
] as const;

export type SignupSource = Partial<Record<(typeof SIGNUP_SOURCE_KEYS)[number], string>>;

export function cleanSignupSource(raw: unknown): SignupSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: SignupSource = {};
  for (const k of SIGNUP_SOURCE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}
