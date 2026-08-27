import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumb } from '@/components/Breadcrumb';
import { getNotesData, countByTag } from '@/lib/notes/data';
import { NotesClient } from './NotesClient';
import { FilterBar } from './FilterBar';
import { formatMonth } from './PostCard';
import styles from './notes.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Emmerdale Agriculture".
  title: 'Notes from the field',
  description:
    'Practical advice on paddocks, weeds, kit, and seasonal jobs — written from the seat of a tractor.',
  alternates: { canonical: '/notes' },
};

// ISR so newly published posts (revalidateTag('notes') from the admin editor)
// appear without a full redeploy.
export const revalidate = 3600;

export default async function NotesIndexPage() {
  const { featured, grid } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const counts = countByTag(all);

  // The index hero borrows the featured post's photo (no separate media
  // library here) — with no posts it degrades to the plain deep-green band.
  const heroPhoto = featured?.hero ?? null;

  return (
    <>
      {/* ===== HERO ===== */}
      <section className={styles.hero}>
        <SiteHeader variant="overlay" />
        {heroPhoto && (
          <div className={styles.heroPhoto}>
            <Image
              src={heroPhoto.url}
              alt={heroPhoto.alt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className={styles.heroInner}>
          <Breadcrumb items={[{ label: 'Notes' }]} />
          <div className={styles.eyebrowLight}>Notes from the field</div>
          <h1 className={styles.heroTitle}>
            Things <em>worth knowing</em>
          </h1>
          <p className={styles.heroSub}>
            Practical advice on paddocks, weeds, kit, and seasonal jobs —
            written from the seat of a tractor.
          </p>
        </div>
      </section>

      {/* ===== FEATURED ===== */}
      {featured && (
        <section className={styles.featuredWrap}>
          <div className={styles.featuredEyebrow}>Featured</div>
          <Link href={`/notes/${featured.slug}`} className={styles.featured}>
            {featured.hero && (
              <div className={styles.featuredPhoto}>
                <Image
                  src={featured.hero.url}
                  alt={featured.hero.alt}
                  fill
                  sizes="(max-width: 1100px) 100vw, 60vw"
                  style={{ objectFit: 'cover' }}
                />
              </div>
            )}
            <div>
              <div className={styles.featuredMeta}>
                {featured.primaryTag && (
                  <span className={styles.tagPill}>{featured.primaryTag}</span>
                )}
                {featured.publishedAt && <span>·</span>}
                {featured.publishedAt && (
                  <span>{formatMonth(featured.publishedAt)}</span>
                )}
              </div>
              <h2 className={styles.featuredTitle}>{featured.title}</h2>
              {featured.excerpt && (
                <p className={styles.featuredExcerpt}>{featured.excerpt}</p>
              )}
              <span className={styles.featuredCta}>Read the post →</span>
            </div>
          </Link>
        </section>
      )}

      {/* ===== TOPIC LINKS + GRID + LOAD MORE (first page of cards renders
           in server HTML; chips link to crawlable /notes/tag/* hubs) ===== */}
      <FilterBar counts={counts} active={null} shownCount={all.length} />
      {/* When the only post is the featured one above, an empty grid saying
          "no posts yet" reads as a contradiction — skip it. */}
      {(grid.length > 0 || all.length === 0) && <NotesClient posts={grid} />}

      {/* ===== FULL ARCHIVE (server-rendered) =====
           Every published post gets a crawlable link from /notes — the
           interactive grid above only shows a page at a time. */}
      <section className={styles.archive} aria-label="All notes">
        <h2 className={styles.archiveTitle}>All notes</h2>
        <ul className={styles.archiveList}>
          {all.map((p) => (
            <li key={p.id}>
              <Link href={`/notes/${p.slug}`}>{p.title}</Link>
              {p.publishedAt && (
                <span className={styles.archiveDate}> — {formatMonth(p.publishedAt)}</span>
              )}
            </li>
          ))}
        </ul>
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
    </>
  );
}
