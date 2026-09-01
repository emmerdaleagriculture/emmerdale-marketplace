import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getNotesData, pickNotesForTags } from '@/lib/notes/data';
import { SERVICE_NOTE_TAGS } from '@/lib/notes/tags';
import { formatMonth } from '@/lib/notes/format';
import s from '@/app/(frontend)/landing.module.css';
import styles from './NotesTeaser.module.css';

/**
 * The service-page → notes direction of the internal linking.
 *
 * Without this the blog was a one-way street: /notes linked out to the money
 * pages, but nothing linked back in, so posts were reachable only from the
 * header, the footer and the sitemap. Surfacing the relevant posts here gives
 * every article a second, topical internal link and gives the service page the
 * supporting content Google looks for on a commercial landing page.
 *
 * Renders nothing when there's no relevant post, so a thin vertical never
 * shows an empty section.
 */
export async function NotesTeaser({
  /** Service path segment — keys SERVICE_NOTE_TAGS. */
  service,
  /** Narrow further (e.g. a county page's own tags). Defaults to the service's. */
  tags,
  heading,
  lede,
  /** Top up with recent posts when there aren't enough tagged ones. */
  fillWithRecent = false,
  alt = false,
  limit = 3,
}: {
  service: keyof typeof SERVICE_NOTE_TAGS | string;
  tags?: string[];
  heading: ReactNode;
  lede?: string;
  fillWithRecent?: boolean;
  alt?: boolean;
  limit?: number;
}) {
  const { featured, grid } = await getNotesData();
  const all = [...(featured ? [featured] : []), ...grid];
  const posts = pickNotesForTags(all, tags ?? SERVICE_NOTE_TAGS[service] ?? [], limit, fillWithRecent);
  if (posts.length === 0) return null;

  return (
    <section className={`${s.section} ${alt ? s.sectionAlt : ''}`}>
      <div className={s.sectionInner}>
        <div className={s.kicker}>Notes from the field</div>
        <h2 className={s.sectionTitle}>{heading}</h2>
        {lede && <p className={s.sectionLede}>{lede}</p>}

        <div className={styles.grid}>
          {posts.map((p) => (
            <Link key={p.id} href={`/notes/${p.slug}`} className={styles.card}>
              {p.hero && (
                <div className={styles.photo}>
                  <Image
                    src={p.hero.url}
                    alt={p.hero.alt}
                    fill
                    sizes="(max-width: 860px) 100vw, 320px"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              )}
              <div className={styles.body}>
                <div className={styles.meta}>
                  {p.primaryTag && <span className={styles.tag}>{p.primaryTag}</span>}
                  {p.publishedAt && <span>{formatMonth(p.publishedAt)}</span>}
                </div>
                <h3 className={styles.heading}>{p.title}</h3>
                {p.excerpt && <p className={styles.excerpt}>{p.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>

        <p className={styles.more}>
          <Link href="/notes">Read all the notes →</Link>
        </p>
      </div>
    </section>
  );
}
