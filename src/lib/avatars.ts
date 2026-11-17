/**
 * Contractor profile pictures (20261117120000). Stored as 400px WebP squares
 * in the public contractor-avatars bucket; the row holds the object path.
 *
 * Client-safe: builds the public URL from the public Supabase URL only.
 */
export const AVATAR_BUCKET = 'contractor-avatars';
export const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const AVATAR_SIZE = 400;

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/** The letter shown when there is no picture: first letter of the name. */
export function avatarInitial(name: string | null | undefined): string {
  const t = (name ?? '').replace(/^(Operator|Contractor)\s+/i, '').trim();
  return (t.slice(0, 1) || '?').toUpperCase();
}
