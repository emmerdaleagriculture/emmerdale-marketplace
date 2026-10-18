/** A person's name as their sign-in provider gave it (Apple, Google), if it did. */
export function nameFromUser(meta: Record<string, unknown> | undefined): string | null {
  const v = meta?.full_name ?? meta?.name;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
