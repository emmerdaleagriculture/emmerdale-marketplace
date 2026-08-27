'use client';

import { useState } from 'react';
import type { NoteCard } from '@/lib/notes/data';
import { PostCard } from './PostCard';
import styles from './notes.module.css';

type Props = {
  posts: NoteCard[];
};

const PAGE_SIZE = 12;

/**
 * Grid with client-side "Load more" pagination. The first page of cards is
 * in the server HTML; topic filtering is real navigation (FilterBar links to
 * the /notes/tag/[tag] hubs) rather than client state.
 */
export function NotesClient({ posts }: Props) {
  const [shownCount, setShownCount] = useState<number>(PAGE_SIZE);

  const visible = posts.slice(0, shownCount);
  const hasMore = posts.length > shownCount;

  return (
    <section className={styles.postsWrap}>
      {posts.length === 0 ? (
        <div className={styles.empty}>No posts yet — check back soon.</div>
      ) : (
        <>
          <div className={styles.postsGrid}>
            {visible.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {hasMore && (
            <div className={styles.loadMoreWrap}>
              <button
                type="button"
                className={styles.loadMore}
                onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              >
                Load more →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
