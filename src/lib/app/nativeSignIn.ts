import { appPlatform, isNativeApp } from '@/lib/app/isApp';

/**
 * Apple and Google sign-in through the native sheets, inside the app only
 * (PRD task 3). The frame carries @capgo/capacitor-social-login; this calls
 * it and hands the ID token to Supabase. Nothing here runs on the website:
 * the buttons use supabase.auth.signInWithOAuth there (SignInButtons.tsx).
 *
 * Client IDs are public identifiers, so they ship as NEXT_PUBLIC_* values:
 *   NEXT_PUBLIC_APPLE_SERVICES_ID      the Services ID (also the Supabase
 *                                      Apple provider's client id)
 *   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID   the Web client (Android and Supabase)
 *   NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID   the iOS client
 *
 * Nonce, for Apple: Apple is handed the SHA-256 of a random value and puts
 * that hash in the ID token; Supabase is handed the random value itself and
 * hashes it to compare. The plugin passes the nonce to Apple untouched
 * (checked in its iOS source), so the hashing happens here. Google's ID
 * token carries no nonce claim from the native sheets, and Supabase only
 * checks one when the token has one, so none is sent for Google.
 */
export type NativeProvider = 'apple' | 'google';

export type NativeSignInResult =
  | { ok: true; name: string | null }
  | { ok: false; cancelled: boolean; message: string };

const APPLE_ID = (process.env.NEXT_PUBLIC_APPLE_SERVICES_ID ?? '').trim();
const GOOGLE_WEB = (process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
const GOOGLE_IOS = (process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

/** Which native sheets can be offered on this device. */
export function nativeProvidersAvailable(): NativeProvider[] {
  if (!isNativeApp()) return [];
  const out: NativeProvider[] = [];
  const platform = appPlatform();
  // Sign in with Apple is iOS-native; on Android the plugin would fall back
  // to a web flow that needs a redirect server, so Android gets the OAuth
  // flow through Supabase instead (SignInButtons handles that).
  if (APPLE_ID && platform === 'ios') out.push('apple');
  if (GOOGLE_WEB && (platform === 'android' || GOOGLE_IOS)) out.push('google');
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let initialised: Promise<typeof import('@capgo/capacitor-social-login')['SocialLogin']> | null = null;

function plugin() {
  initialised ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    await SocialLogin.initialize({
      ...(APPLE_ID ? { apple: { clientId: APPLE_ID } } : {}),
      ...(GOOGLE_WEB
        ? { google: { webClientId: GOOGLE_WEB, ...(GOOGLE_IOS ? { iOSClientId: GOOGLE_IOS } : {}), mode: 'online' as const } }
        : {}),
    });
    return SocialLogin;
  });
  return initialised;
}

function isCancel(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? err).toLowerCase();
  return /cancel|canceled|cancelled|1001|user closed|dismiss/.test(m);
}

export async function nativeSignIn(provider: NativeProvider): Promise<NativeSignInResult> {
  try {
    const SocialLogin = await plugin();
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    let idToken: string | null = null;
    let nonce: string | undefined;
    let name: string | null = null;

    if (provider === 'apple') {
      const raw = crypto.randomUUID();
      const hashed = await sha256Hex(raw);
      const res = await SocialLogin.login({
        provider: 'apple',
        options: { scopes: ['email', 'name'], nonce: hashed },
      });
      idToken = res.result.idToken;
      nonce = raw;
      const p = res.result.profile;
      name = [p?.givenName, p?.familyName].filter(Boolean).join(' ') || null;
    } else {
      const res = await SocialLogin.login({
        provider: 'google',
        options: { scopes: ['email', 'profile'] },
      });
      if (res.result.responseType !== 'online') {
        return { ok: false, cancelled: false, message: 'Google did not return a sign-in token.' };
      }
      idToken = res.result.idToken;
      name = res.result.profile?.name || null;
    }

    if (!idToken) {
      return { ok: false, cancelled: false, message: 'The sign-in did not return a token. Please try again.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
    if (error || !data.user) {
      return { ok: false, cancelled: false, message: error?.message ?? 'Sign-in failed.' };
    }

    // Apple only hands the name over on the very first sign-in; keep it so
    // the role screen can fill in the contact name.
    const meta = data.user.user_metadata ?? {};
    if (name && !meta.full_name && !meta.name) {
      await supabase.auth.updateUser({ data: { full_name: name } }).catch(() => {});
    }
    return { ok: true, name };
  } catch (err) {
    if (isCancel(err)) return { ok: false, cancelled: true, message: '' };
    console.error('[app] native sign-in failed:', err);
    return {
      ok: false,
      cancelled: false,
      message: 'That sign-in did not go through. Try again, or continue with email.',
    };
  }
}
