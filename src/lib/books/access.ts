import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Books is released account by account while it's trialled. app_config
 * `books_allowlist` is a JSON array of account emails, or "all" for every
 * Premium member; missing or unreadable means nobody. Premium membership is
 * still required on top of this (see server.ts).
 */
export async function booksAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const { data } = await createServiceRoleClient().from('app_config').select('value').eq('key', 'books_allowlist').maybeSingle();
    const v = data?.value;
    if (v === 'all') return true;
    return Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim().toLowerCase() === email.trim().toLowerCase());
  } catch {
    return false;
  }
}

/** The allowlist read once, as a test, for jobs that check many accounts. */
export async function booksAllowList(): Promise<(email: string | null | undefined) => boolean> {
  let v: unknown = null;
  try {
    const { data } = await createServiceRoleClient().from('app_config').select('value').eq('key', 'books_allowlist').maybeSingle();
    v = data?.value ?? null;
  } catch {
    v = null;
  }
  const list = Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase())) : null;
  return (email) => Boolean(email) && (v === 'all' || Boolean(list?.has(email!.trim().toLowerCase())));
}

/**
 * Whether the app's tab bar shows Books (src/components/app/tabs.ts): every
 * contractor, since 2026-11-20. Members get their books; anyone without
 * Premium gets the page with sample figures under a Premium overlay
 * (BooksPreview), which says what it is without selling it in the app.
 */
export async function booksTabFor(userId: string, _email?: string | null): Promise<boolean> {
  const { data: c } = await createServiceRoleClient().from('contractors').select('id').eq('id', userId).maybeSingle();
  return Boolean(c);
}
