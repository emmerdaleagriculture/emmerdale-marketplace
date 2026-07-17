/**
 * Validates the environment variables the app needs to boot. Importing this
 * module checks `process.env` once so a misconfigured deploy fails fast with a
 * clear, aggregated error instead of a confusing runtime failure later.
 *
 * The hard failure is gated to production (`NODE_ENV === 'production'`) so it
 * doesn't break local tooling that loads the module without a full env. In
 * non-production it warns and continues.
 *
 * Only boot-critical, always-required vars are checked here. The service-role
 * key and Resend key are validated at their point of use (admin routes, email
 * sends) so public pages can render without them.
 */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  const msg =
    `[env] Missing required environment variables: ${missing.join(', ')}. ` +
    `Set them in .env.local (see .env.local.example) or your hosting provider.`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  }
  console.warn(`${msg} (continuing — non-production)`);
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  // Optional — enables the Turnstile widget on auth forms. The matching secret
  // key lives in the Supabase dashboard (Auth → Attack Protection), not here.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim(),
};
