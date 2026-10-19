/**
 * Which of Apple and Google sign-in are configured at all. The buttons
 * render only for a configured provider: a provider that is not enabled
 * in Supabase answers "Unsupported provider: provider is not enabled",
 * which real visitors saw on the website's login page before the client
 * IDs were set (2026-10-19). Setting the ID is the switch; the Supabase
 * provider has to be enabled with it (docs/app-mode.md).
 *
 * Client IDs are public identifiers, so they ship as NEXT_PUBLIC_* values
 * and are read here on the server and in the browser alike:
 *   NEXT_PUBLIC_APPLE_SERVICES_ID      the Services ID (also the Supabase
 *                                      Apple provider's client id)
 *   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID   the Web client (Android and Supabase)
 *   NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID   the iOS client
 *
 * Read inside the functions, not at module load, so tests can set them;
 * Next.js still inlines the literal process.env.NEXT_PUBLIC_* references
 * into the browser bundle.
 */
export type SignInProvider = 'apple' | 'google';

export const appleServicesId = () => (process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? '').trim();
export const googleWebClientId = () => (process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
export const googleIosClientId = () => (process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

/** Providers with a client ID set, in no particular order. Empty = show no buttons. */
export function signInProvidersConfigured(): SignInProvider[] {
  const out: SignInProvider[] = [];
  if (appleServicesId()) out.push('apple');
  if (googleWebClientId()) out.push('google');
  return out;
}
