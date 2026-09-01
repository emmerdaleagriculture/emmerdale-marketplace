import Link from 'next/link';
import type { ServiceLink } from '@/lib/notes/tags';
import styles from './ServiceLinks.module.css';

/**
 * The notes → service-page direction of the internal linking.
 *
 * Every article and tag hub gets a crawlable, in-content block of links to the
 * pages that sell the work it describes, chosen from the post's own tags. It
 * complements the single big CTA panel: that panel converts, this passes link
 * equity to more than one destination and gives a reader who wants a different
 * service somewhere to go.
 */
export function ServiceLinks({
  links,
  heading = 'Want this done for you?',
}: {
  links: ServiceLink[];
  heading?: string;
}) {
  if (links.length === 0) return null;

  return (
    <section className={styles.wrap} aria-label="Related services">
      <h2 className={styles.heading}>{heading}</h2>
      <ul className={styles.list}>
        {links.map((l) => (
          <li key={l.href} className={styles.item}>
            <Link href={l.href} className={styles.link}>
              <div className={styles.label}>{l.label} →</div>
              <p className={styles.blurb}>{l.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
