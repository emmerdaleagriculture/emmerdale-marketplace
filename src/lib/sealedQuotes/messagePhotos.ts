import { randomUUID } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PHOTO_MIN_BYTES } from '@/lib/photoDownscale';

/**
 * Photos sent in a customer↔contractor message (20260930120000_message_photos).
 *
 * Private bucket, one folder per job — `<submission_id>/<uuid>.<ext>` — so a
 * deleted job's photos can be listed and removed together, and so
 * sq_post_message can refuse a path from another job's folder. Everything
 * goes through the service role; the pages show them by signed URL.
 */

export const MESSAGE_PHOTOS_BUCKET = 'message-photos';
export const MESSAGE_PHOTOS_MAX = 4;
/**
 * The browser downscales to ~0.5MB; the ceiling only stops something absurd.
 * The floor catches a phone that uploaded a 1×1 blank in place of the photo
 * (see photoDownscale.ts) — better told now than a broken thread later.
 */
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** Long enough to read a thread, short enough that a copied link dies. */
const SIGNED_URL_SECONDS = 3600;

/** The photos on the form, or the sentence saying what is wrong with them. */
export function readMessagePhotos(formData: FormData): { files: File[] } | { error: string } {
  const files = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MESSAGE_PHOTOS_MAX) {
    return { error: `Send up to ${MESSAGE_PHOTOS_MAX} photos at a time.` };
  }
  for (const f of files) {
    if (!PHOTO_TYPES[f.type]) return { error: 'Photos need to be JPEG, PNG or WebP pictures.' };
    if (f.size > PHOTO_MAX_BYTES) return { error: 'One of those photos is too large — try a smaller one.' };
    if (f.size < PHOTO_MIN_BYTES) return { error: 'One of those photos came through empty — remove it and add it again.' };
  }
  return { files };
}

/**
 * Upload before the message is posted, so the message never points at a
 * file that isn't there. If any upload fails the ones that landed are
 * removed and null comes back.
 */
export async function uploadMessagePhotos(submissionId: string, files: File[]): Promise<string[] | null> {
  if (files.length === 0) return [];
  const storage = createServiceRoleClient().storage.from(MESSAGE_PHOTOS_BUCKET);
  const results = await Promise.all(
    files.map(async (file) => {
      const path = `${submissionId}/${randomUUID()}.${PHOTO_TYPES[file.type]}`;
      const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
      });
      if (error) {
        console.error(`[sq] message photo upload failed (${path}):`, error.message);
        return null;
      }
      return path;
    }),
  );
  const paths = results.filter((p): p is string => p !== null);
  if (paths.length < files.length) {
    await removeMessagePhotos(paths);
    return null;
  }
  return paths;
}

/** Best effort: a leftover file is invisible, a thrown error here is not. */
export async function removeMessagePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await createServiceRoleClient().storage.from(MESSAGE_PHOTOS_BUCKET).remove(paths);
  if (error) console.error('[sq] message photo removal failed:', error.message);
}

/** Every photo sent on a job, for when the job itself is deleted. */
export async function removeJobMessagePhotos(submissionId: string): Promise<void> {
  const storage = createServiceRoleClient().storage.from(MESSAGE_PHOTOS_BUCKET);
  const { data } = await storage.list(submissionId, { limit: 1000 });
  await removeMessagePhotos((data ?? []).map((f) => `${submissionId}/${f.name}`));
}

/** Signed URLs for many photos in one call, keyed by path. */
export async function signMessagePhotos(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await createServiceRoleClient()
    .storage.from(MESSAGE_PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) console.error('[sq] message photo signing failed:', error.message);
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return urls;
}
