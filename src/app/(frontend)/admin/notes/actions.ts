'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { CURATED_TAGS } from '@/lib/notes/tags';
import type { FormState } from '@/lib/form';

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user;
}

const HERO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
const HERO_MAX_BYTES = 8 * 1024 * 1024;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Refresh the public pages a post touches (ISR + the shared cached query). */
function refreshPublic(slugs: string[], tags: string[]) {
  revalidateTag('notes');
  revalidatePath('/notes');
  for (const s of new Set(slugs)) revalidatePath(`/notes/${s}`);
  for (const t of new Set(tags)) revalidatePath(`/notes/tag/${t}`);
}

export async function saveNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const admin = createServiceRoleClient();

  const id = String(formData.get('id') ?? '').trim() || null;
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'A title is required.' };

  const slug = slugify(String(formData.get('slug') ?? '').trim() || title);
  if (!slug) return { error: 'Couldn’t derive a slug — set one explicitly.' };

  const validTags = new Set(CURATED_TAGS.map((t) => t.slug));
  const tags = formData
    .getAll('tags')
    .map(String)
    .filter((t) => validTags.has(t));
  const primaryTagRaw = String(formData.get('primary_tag') ?? '');
  const primary_tag = validTags.has(primaryTagRaw) ? primaryTagRaw : (tags[0] ?? null);
  // The primary tag drives the breadcrumb/CTA and should always be one of
  // the post's tags.
  if (primary_tag && !tags.includes(primary_tag)) tags.unshift(primary_tag);

  const published = formData.get('published') === 'on';
  const featured = formData.get('featured') === 'on';

  const fields = {
    title,
    slug,
    excerpt: String(formData.get('excerpt') ?? '').trim() || null,
    content_md: String(formData.get('content_md') ?? ''),
    primary_tag,
    tags,
    hero_alt: String(formData.get('hero_alt') ?? '').trim() || null,
    featured,
    published,
    updated_at: new Date().toISOString(),
  };

  // Previous state — needed to revalidate an old slug/tags after a rename,
  // and to set published_at only on first publish.
  let prevSlug: string | null = null;
  let prevTags: string[] = [];
  let publishedAt: string | null = null;
  if (id) {
    const { data: prev } = await admin
      .from('notes')
      .select('slug, tags, published_at')
      .eq('id', id)
      .maybeSingle();
    if (!prev) return { error: 'Note not found.' };
    prevSlug = prev.slug;
    prevTags = prev.tags ?? [];
    publishedAt = prev.published_at;
  }
  if (published && !publishedAt) publishedAt = new Date().toISOString();

  let noteId = id;
  if (id) {
    const { error } = await admin
      .from('notes')
      .update({ ...fields, published_at: publishedAt })
      .eq('id', id);
    if (error) {
      return {
        error: error.code === '23505' ? 'That slug is already in use.' : error.message,
      };
    }
  } else {
    const { data, error } = await admin
      .from('notes')
      .insert({ ...fields, published_at: publishedAt })
      .select('id')
      .single();
    if (error || !data) {
      return {
        error:
          error?.code === '23505' ? 'That slug is already in use.' : (error?.message ?? 'Insert failed.'),
      };
    }
    noteId = data.id;
  }

  // Hero upload (optional). Timestamped path so the public URL changes and
  // every cache (CDN, next/image) picks up the replacement.
  const hero = formData.get('hero');
  if (hero instanceof File && hero.size > 0) {
    if (hero.size > HERO_MAX_BYTES) return { error: 'Hero image is over 8MB.' };
    const ext = HERO_TYPES[hero.type];
    if (!ext) return { error: 'Hero must be a JPEG, PNG, WebP or AVIF image.' };
    const path = `${noteId}/hero-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from('notes-media')
      .upload(path, Buffer.from(await hero.arrayBuffer()), {
        contentType: hero.type,
        upsert: true,
      });
    if (upErr) return { error: `Hero upload failed: ${upErr.message}` };
    const { error } = await admin.from('notes').update({ hero_path: path }).eq('id', noteId!);
    if (error) return { error: error.message };
  }

  refreshPublic([slug, ...(prevSlug ? [prevSlug] : [])], [...tags, ...prevTags]);
  revalidatePath('/admin/notes');
  revalidatePath(`/admin/notes/${noteId}`);

  if (!id) redirect(`/admin/notes/${noteId}`);
  return { ok: true, message: 'Saved.' };
}

export async function deleteNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const admin = createServiceRoleClient();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing note id.' };

  const { data: note } = await admin
    .from('notes')
    .select('slug, tags')
    .eq('id', id)
    .maybeSingle();
  if (!note) return { error: 'Note not found.' };

  // Remove the note's media first (best-effort — an orphaned file is
  // harmless in a public bucket, the row delete is what matters).
  const { data: files } = await admin.storage.from('notes-media').list(id);
  if (files && files.length > 0) {
    await admin.storage.from('notes-media').remove(files.map((f) => `${id}/${f.name}`));
  }

  const { error } = await admin.from('notes').delete().eq('id', id);
  if (error) return { error: error.message };

  refreshPublic([note.slug], note.tags ?? []);
  revalidatePath('/admin/notes');
  redirect('/admin/notes');
}
