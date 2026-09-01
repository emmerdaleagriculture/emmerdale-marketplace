import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ServiceLinks } from '@/components/notes/ServiceLinks';
import { jsonLd } from '@/lib/jsonld';
import { tagDef, ctaForTag, serviceLinksForTags } from '@/lib/notes/tags';
import {
  getNoteBySlug,
  getNotesData,
  noteHeroUrl,
  noteWordCount,
  type NoteCard,
} from '@/lib/notes/data';
import { createStaticClient } from '@/lib/supabase/static';
import { formatMonth } from '../PostCard';
import styles from './post.module.css';
import { siteUrl } from '@/lib/site';

type Params = { slug: string };

export const revalidate = 3600;

export async function generateStaticParams() {
  // A build-time DB blip must not fail the deploy. On error, prerender nothing —
  // pages render on demand and ISR (revalidate) caches them from then on.
  try {
    const db = createStaticClient();
    const { data, error } = await db.from('notes').select('slug').eq('published', true).limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({ slug: d.slug }));
  } catch (err) {
    console.error('[notes/[slug]] generateStaticParams query failed:', err);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNoteBySlug(slug);
  if (!post) return { title: 'Post not found' };

  const heroUrl = noteHeroUrl(post.hero_path);
  const description = post.excerpt || 'Notes from the field — Emmerdale Agriculture.';

  return {
    // Post title + suffix; the layout template appends the brand once.
    title: `${post.title} — Notes from the field`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      // Never ship a summary_large_image card with no image — fall back to
      // the site default.
      images: heroUrl
        ? [{ url: heroUrl }]
        : [{ url: '/og-image.jpg', width: 1200, height: 630 }],
    },
    alternates: { canonical: `/notes/${post.slug}` },
  };
}

function rankRelated(post: { id: string; tags: string[] }, all: NoteCard[]): NoteCard[] {
  const candidates = all.filter((p) => p.id !== post.id);
  const tagSet = new Set(post.tags);
  if (tagSet.size === 0) return candidates.slice(0, 3);

  // 1. Tag-overlap candidates, 2. rank by overlap then recency,
  // 3. fill with most-recent if short. (candidates are already newest-first)
  const ranked = candidates
    .map((p) => ({ p, overlap: p.tags.filter((t) => tagSet.has(t)).length }))
    .filter((r) => r.overlap > 0)
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      const ad = a.p.publishedAt ? new Date(a.p.publishedAt).getTime() : 0;
      const bd = b.p.publishedAt ? new Date(b.p.publishedAt).getTime() : 0;
      return bd - ad;
    })
    .slice(0, 3)
    .map((r) => r.p);

  if (ranked.length < 3) {
    const have = new Set(ranked.map((r) => r.id));
    ranked.push(...candidates.filter((p) => !have.has(p.id)).slice(0, 3 - ranked.length));
  }
  return ranked;
}

export default async function NotePostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getNoteBySlug(slug);
  if (!post) notFound();

  const heroUrl = noteHeroUrl(post.hero_path);
  const heroAlt = post.hero_alt || post.title;

  // Markdown → HTML, server-side. Content is admin-authored (service-role
  // write path only), so it carries the same trust as the rest of the site.
  const bodyHtml = await marked.parse(post.content_md, { async: true });

  // Read time (~220 wpm)
  const readMinutes = Math.max(1, Math.round(noteWordCount(post.content_md) / 220));

  const primaryTag = post.primary_tag ?? post.tags[0] ?? null;
  const cta = ctaForTag(primaryTag);
  // Primary tag first, so the closest service leads the list. Contractors
  // read these posts too, so /signup rides along at the bottom. The CTA panel
  // below already pushes cta.href hard — repeating it as the first item of the
  // list directly underneath is noise, so this block is genuinely "the rest".
  const serviceLinks = serviceLinksForTags(
    [primaryTag, ...post.tags].filter((t): t is string => Boolean(t)),
    true,
  ).filter((l) => l.href !== cta.href);

  // Related posts from the shared cached index query — no extra round-trip.
  const { featured, grid } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const related = rankRelated(post, all);

  const site = siteUrl();

  // Curated tags link to their crawlable hub; anything else falls back to
  // the index.
  const primaryDef = tagDef(primaryTag);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    image: heroUrl ? [heroUrl] : undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at ?? post.published_at ?? undefined,
    wordCount: noteWordCount(post.content_md) || undefined,
    // Topic signals straight off the post's own taxonomy.
    articleSection: primaryDef?.label ?? primaryTag ?? undefined,
    keywords: post.tags.length ? post.tags.join(', ') : undefined,
    author: {
      '@type': 'Person',
      name: 'Tom Oswald',
      url: site,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Emmerdale Agriculture',
      // Google requires publisher.logo for Article rich-result eligibility.
      logo: {
        '@type': 'ImageObject',
        url: `${site}/apple-icon.png`,
        width: 180,
        height: 180,
      },
    },
    mainEntityOfPage: `${site}/notes/${post.slug}`,
  };

  const breadcrumbHref = primaryDef ? `/notes/tag/${primaryDef.slug}` : '/notes';
  const breadcrumbLabel = primaryDef
    ? primaryDef.label
    : primaryTag
      ? primaryTag.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
      : 'Notes from the field';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
      />

      {/* ===== POST HERO ===== */}
      <section className={styles.postHero}>
        <SiteHeader variant="overlay" />
        {heroUrl && (
          <div className={styles.postHeroPhoto}>
            <Image
              src={heroUrl}
              alt={heroAlt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.postHeroInner}>
          {/* Title appears in the h1 below, so it isn't repeated as a
              terminal crumb — the trail just gets the reader back to the
              filtered index for the same tag. */}
          <Breadcrumb
            items={[
              { label: 'Notes', href: '/notes' },
              { label: breadcrumbLabel, href: primaryTag ? breadcrumbHref : undefined },
            ]}
          />
          <h1 className={styles.postTitle}>{post.title}</h1>
          <div className={styles.postHeroMeta}>
            {primaryTag && <span className={styles.postHeroTag}>{primaryTag}</span>}
            {post.published_at && <span>{formatMonth(post.published_at)}</span>}
            <span>{readMinutes} min read</span>
          </div>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article
        className={styles.article}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* ===== CTA PANEL — routed by primary tag ===== */}
      <section className={styles.serviceCta}>
        <div className={styles.serviceCtaInner}>
          <div>
            <div className={styles.serviceCtaEyebrow}>Want this done for you?</div>
            <h3 className={styles.serviceCtaTitle}>
              {cta.title} <em>{cta.titleEm}</em>
            </h3>
            <p className={styles.serviceCtaSub}>{cta.sub}</p>
          </div>
          <Link href={cta.href} className={styles.serviceCtaBtn}>
            {cta.label}
          </Link>
        </div>
      </section>

      {/* ===== SERVICE LINKS =====
           In-content links from the article to the pages that do the work it
           describes, chosen from the post's tags. The CTA panel above pushes
           one destination; this gives the reader (and the crawler) the rest. */}
      <ServiceLinks links={serviceLinks} heading="Elsewhere in the network" />

      {/* ===== SIGN-OFF ===== */}
      <div className={styles.signoff}>
        <div className={styles.signoffPhoto} aria-hidden="true" />
        <div className={styles.signoffText}>
          <strong>Tom Oswald</strong>
          Runs Emmerdale Agriculture, the network behind this site. Writes from
          the seat of a tractor.
        </div>
      </div>

      {/* ===== RELATED POSTS ===== */}
      {related.length > 0 && (
        <section className={styles.related}>
          <div className={styles.relatedInner}>
            <div className={styles.relatedEyebrow}>Related</div>
            <h3 className={styles.relatedTitle}>
              Keep <em>reading</em>
            </h3>
            <div className={styles.relatedGrid}>
              {related.map((r) => (
                <Link key={r.id} href={`/notes/${r.slug}`} className={styles.relatedCard}>
                  {r.hero && (
                    <div className={styles.relatedPhoto}>
                      <Image
                        src={r.hero.url}
                        alt={r.hero.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <div className={styles.relatedBody}>
                    <div className={styles.relatedMeta}>
                      {r.primaryTag && (
                        <span className={styles.relatedTag}>{r.primaryTag}</span>
                      )}
                      {r.publishedAt && <span>{formatMonth(r.publishedAt)}</span>}
                    </div>
                    <div className={styles.relatedHeading}>{r.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </>
  );
}
