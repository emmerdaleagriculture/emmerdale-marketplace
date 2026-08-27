import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { jsonLd } from '@/lib/jsonld';
import { CURATED_TAGS, tagDef } from '@/lib/notes/tags';
import { getNotesData, countByTag } from '@/lib/notes/data';
import { PostCard } from '../../PostCard';
import { FilterBar } from '../../FilterBar';
import styles from '../../notes.module.css';

type Params = { tag: string };

export const revalidate = 3600;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://emmerdaleagriculture.com'
).replace(/\/$/, '');

export function generateStaticParams() {
  return CURATED_TAGS.map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tag } = await params;
  const def = tagDef(tag);
  if (!def) return { title: 'Not found' };
  return {
    // Bare title — the layout template appends " | Emmerdale Agriculture".
    title: def.metaTitle,
    description: def.description,
    alternates: { canonical: `/notes/tag/${def.slug}` },
  };
}

export default async function TagHubPage({ params }: { params: Promise<Params> }) {
  const { tag } = await params;
  const def = tagDef(tag);
  if (!def) notFound();

  const { featured, grid } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const counts = countByTag(all);
  const posts = all.filter((p) => p.tags.includes(def.slug));
  // An empty hub is a soft-404 magnet — 404 properly until posts exist.
  if (posts.length === 0) notFound();

  // Hub hero borrows the first post's photo (matches the index behaviour).
  const heroPhoto = posts.find((p) => p.hero)?.hero ?? null;

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: def.metaTitle,
    description: def.description,
    url: `${SITE_URL}/notes/tag/${def.slug}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: `${SITE_URL}/notes/${p.slug}`,
      })),
    },
  };

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <SiteHeader variant="overlay" />
        {heroPhoto && (
          <div className={styles.heroPhoto}>
            <Image
              src={heroPhoto.url}
              alt={`${def.label} — field and paddock work`}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.heroInner}>
          <Breadcrumb
            items={[{ label: 'Notes', href: '/notes' }, { label: def.label }]}
          />
          <div className={styles.eyebrowLight}>Notes from the field</div>
          <h1 className={styles.heroTitle}>
            {def.label} <em>notes</em>
          </h1>
          <p className={styles.heroSub}>{def.description}</p>
        </div>
      </section>

      {/* ===== TOPIC LINKS + GRID (fully server-rendered — hubs are small
           enough to skip pagination, so every card is in the HTML) ===== */}
      <FilterBar counts={counts} active={def.slug} shownCount={posts.length} />
      <section className={styles.postsWrap}>
        <div className={styles.postsGrid}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </section>

      {/* ===== CTA BAND ===== */}
      <section className={styles.ctaBand}>
        <h3 className={styles.ctaTitle}>
          Reading is fine. <em>Doing is better.</em>
        </h3>
        <p className={styles.ctaBody}>
          If your field or paddock needs work and you&rsquo;d rather someone
          else handled it, tell us what needs doing.
        </p>
        <Link href="/start" className={styles.btnPrimary}>
          Post your job →
        </Link>
      </section>

      <SiteFooter />
      {/* Server-rendered JSON-LD so crawlers see it in the initial HTML. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema) }}
      />
    </>
  );
}
