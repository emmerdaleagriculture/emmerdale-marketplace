/** Where a dead link sends people: a reset gets a fresh form with the reason on it. */
export function linkFailedPath(type: string | null): string {
  return type === 'recovery' ? '/reset-password?error=link' : '/login?error=link';
}
