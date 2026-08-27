import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createStaticClient } from '@/lib/supabase/static';

/**
 * Plain-shape post card for the /notes index, tag hubs and related grids.
 * The server fetch projects DB rows down to this before passing anything to
 * client components, so the payload-over-the-wire stays small and stable.
 * (Ported from the HPM blog; Supabase-backed here instead of Payload.)
 */
export type NoteCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  primaryTag: string | null;
  tags: string[];
  hero: { url: string; alt: string } | null;
};

export type NoteRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  primary_tag: string | null;
  tags: string[];
  hero_path: string | null;
  hero_alt: string | null;
  featured: boolean;
  published: boolean;
  published_at: string | null;
  updated_at: string;
};

/** Public URL for a notes-media storage path (the bucket is public). */
export function noteHeroUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/notes-media/${path}`;
}

function project(r: NoteRow): NoteCard {
  const url = noteHeroUrl(r.hero_path);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    publishedAt: r.published_at,
    primaryTag: r.primary_tag,
    tags: r.tags ?? [],
    hero: url ? { url, alt: r.hero_alt || r.title } : null,
  };
}

const CARD_FIELDS =
  'id, slug, title, excerpt, content_md, primary_tag, tags, hero_path, hero_alt, featured, published, published_at, updated_at';

/**
 * Single cached query behind /notes AND every /notes/tag/[tag] hub — the
 * hubs filter this in memory rather than issuing their own DB queries.
 * Invalidated by revalidateTag('notes') from the admin editor.
 */
export const getNotesData = unstable_cache(
  async () => {
    const db = createStaticClient();
    const { data, error } = await db
      .from('notes')
      .select(CARD_FIELDS)
      .eq('published', true)
      .order('published_at', { ascending: false, nullsFirst: false });
    if (error) {
      console.error('[notes] index query failed:', error.message);
      return { featured: null as NoteCard | null, grid: [] as NoteCard[] };
    }

    const rows = (data ?? []) as unknown as NoteRow[];
    const all = rows.map(project);

    // Featured: explicit flag wins (rows are sorted newest-first, so the
    // first flagged post is the most recent), else fall back to most recent.
    let featured: NoteCard | null = null;
    const featuredRaw = rows.find((r) => r.featured);
    if (featuredRaw) {
      featured = project(featuredRaw);
    } else if (all.length > 0) {
      featured = all[0];
    }

    // Index grid excludes the featured post (avoid duplication).
    const grid = featured ? all.filter((p) => p.id !== featured!.id) : all;

    return { featured, grid };
  },
  ['notes-data'],
  { revalidate: 300, tags: ['notes'] },
);

/**
 * Full post row for the article page. Wrapped in React cache() so
 * generateMetadata and the page render share a single query per request.
 * Published only — drafts 404 on the public site.
 */
export const getNoteBySlug = cache(async (slug: string): Promise<NoteRow | null> => {
  const db = createStaticClient();
  const { data, error } = await db
    .from('notes')
    .select(CARD_FIELDS)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error) {
    console.error('[notes] slug query failed:', error.message);
    return null;
  }
  return (data as unknown as NoteRow) ?? null;
});

/** Published-post count per curated tag, for chips + sitemap gating. */
export function countByTag(posts: NoteCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}

/** Word count of the markdown body, for read-time (~220 wpm). */
export function noteWordCount(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`[\]()!-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}
