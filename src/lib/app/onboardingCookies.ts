/** Per-device memories of the one-time onboarding screens (a year each). */
export const PUSH_ASKED_COOKIE = 'ea_push_asked';
export const SITE_ASKED_COOKIE = 'ea_site_asked';

export function rememberAsked(name: string) {
  try {
    document.cookie = `${name}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {}
}
