'use server';

import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { revalidateDirectory } from '@/lib/directory';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { AVATAR_BUCKET, AVATAR_MAX_UPLOAD_BYTES, AVATAR_SIZE } from '@/lib/avatars';
import { PHOTO_MIN_BYTES } from '@/lib/photoDownscale';

export type AvatarState = { ok?: boolean; error?: string };

/**
 * Sets the signed-in contractor's profile picture. Whatever arrives is
 * decoded and re-encoded here (400px square WebP, EXIF orientation applied
 * then stripped, so no GPS leaves with it); a file sharp cannot read is
 * refused rather than stored. Each upload gets a fresh path, so caches never
 * serve the old picture, and the previous object is removed.
 */
export async function uploadAvatarAction(_prev: AvatarState, formData: FormData): Promise<AvatarState> {
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size < PHOTO_MIN_BYTES) {
    return { error: 'Choose a photo or logo to upload.' };
  }
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) return { error: 'That file is too big. Try one under 8MB.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in again.' };

  const admin = createServiceRoleClient();
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, avatar_path')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor) return { error: 'Only contractor accounts can add a picture.' };

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: 'We couldn’t read that image. Try a JPEG or PNG.' };
  }

  const path = `${user.id}/${Date.now()}.webp`;
  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, webp, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (upErr) {
    console.error('[avatar] upload failed', { contractor: user.id, error: upErr.message });
    return { error: 'That didn’t go through. Please try again.' };
  }

  const { error: rowErr } = await admin.from('contractors').update({ avatar_path: path }).eq('id', user.id);
  if (rowErr) {
    console.error('[avatar] row update failed', { contractor: user.id, error: rowErr.message });
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    return { error: 'That didn’t go through. Please try again.' };
  }
  if (contractor.avatar_path) await admin.storage.from(AVATAR_BUCKET).remove([contractor.avatar_path]);

  revalidatePath('/account', 'layout');
  revalidateDirectory();
  return { ok: true };
}

export async function removeAvatarAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createServiceRoleClient();
  const { data: contractor } = await admin
    .from('contractors')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle();
  if (!contractor?.avatar_path) return;

  const { error } = await admin.from('contractors').update({ avatar_path: null }).eq('id', user.id);
  if (error) throw new Error(error.message);
  await admin.storage.from(AVATAR_BUCKET).remove([contractor.avatar_path]);

  revalidatePath('/account', 'layout');
  revalidateDirectory();
}
