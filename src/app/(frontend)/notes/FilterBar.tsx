import Link from 'next/link';
import { CURATED_TAGS } from '@/lib/notes/tags';
import styles from './notes.module.css';

type Props = {
  /** Published-post count per tag slug — chips with zero posts are hidden. */
  counts: Map<string, number>;
  /** Active tag slug, or null on the /notes index ("All notes"). */
  active: string | null;
  /** Post count shown in the pill (the active view's total). */
  shownCount: number;
};

/**
 * Topic chips as real links — /notes ↔ /notes/tag/[tag] — so every hub is
 * reachable in crawlable HTML.
 */
export function FilterBar({ counts, active, shownCount }: Props) {
  return (
    <div className={styles.filterBar}>
      <div className={styles.filterInner}>
        <span className={styles.filterLabel}>Browse by topic</span>
        <div className={styles.filterChips}>
          <Link
            href="/notes"
            className={`${styles.chip} ${active === null ? styles.chipActive : ''}`}
          >
            All notes
          </Link>
          {CURATED_TAGS.filter((t) => (counts.get(t.slug) ?? 0) > 0).map((t) => (
            <Link
              key={t.slug}
              href={`/notes/tag/${t.slug}`}
              className={`${styles.chip} ${active === t.slug ? styles.chipActive : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <span className={styles.countPill}>
          {shownCount} {shownCount === 1 ? 'post' : 'posts'}
        </span>
      </div>
    </div>
  );
}
