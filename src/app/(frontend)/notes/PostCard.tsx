import Image from 'next/image';
import Link from 'next/link';
import type { NoteCard } from '@/lib/notes/data';
import styles from './notes.module.css';

export function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// No 'use client' — renders server-side on the tag hubs (crawlable HTML)
// and hydrates fine when imported from the client grid on /notes.
export function PostCard({ post }: { post: NoteCard }) {
  return (
    <Link href={`/notes/${post.slug}`} className={styles.postCard}>
      {post.hero && (
        <div className={styles.postPhotoWrap}>
          <Image
            src={post.hero.url}
            alt={post.hero.alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 33vw"
            quality={60}
            className={styles.postPhoto}
          />
        </div>
      )}
      <div className={styles.postMeta}>
        {post.primaryTag && <span className={styles.tagPill}>{post.primaryTag}</span>}
        {post.publishedAt && <span>·</span>}
        {post.publishedAt && <span>{formatMonth(post.publishedAt)}</span>}
      </div>
      <h3 className={styles.postTitle}>{post.title}</h3>
      {post.excerpt && <p className={styles.postExcerpt}>{post.excerpt}</p>}
    </Link>
  );
}
