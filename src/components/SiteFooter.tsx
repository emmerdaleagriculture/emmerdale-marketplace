import Link from 'next/link';
import styles from './SiteFooter.module.css';
import {
  SITE_FOOTER_STRAPLINE,
  COMPANY_LEGAL_NAME,
  COMPANY_REG_LINE,
  HPM_URL,
  SITE_LOCATION_LINE,
} from '@/lib/site';

/**
 * Site footer — credibility block in the HPM visual language. The marketplace
 * is the parent brand, so the relationship line points *down* to HPM (rather
 * than HPM's "trading as Emmerdale Agriculture Ltd").
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.cols}>
          <div className={styles.brandCol}>
            <div className={styles.brand}>Emmerdale Agriculture</div>
            <div className={styles.tag}>{SITE_FOOTER_STRAPLINE}</div>
            <p className={styles.blurb}>
              The contractor network run by {COMPANY_LEGAL_NAME}, the company
              behind{' '}
              <a href={HPM_URL} className={styles.link}>
                Hampshire Paddock Management
              </a>
              .
            </p>
          </div>

          <nav className={styles.linkCol} aria-label="Network">
            <div className={styles.colTitle}>The network</div>
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/notes">Notes from the field</Link>
            <Link href="/signup">Join as a contractor</Link>
            <Link href="/login">Log in</Link>
          </nav>

          <nav className={styles.linkCol} aria-label="Services">
            <div className={styles.colTitle}>Looking for</div>
            <Link href="/paddock-maintenance">Paddock maintenance</Link>
            <Link href="/hay-bales">Hay, straw &amp; haylage</Link>
            <Link href="/tractor-hire">Tractor hire</Link>
          </nav>

          <nav className={styles.linkCol} aria-label="Company">
            <div className={styles.colTitle}>Company</div>
            <a href={HPM_URL}>Hampshire Paddock Management</a>
            <Link href="/privacy">Privacy policy</Link>
            {/* Customer-facing documents are PDFs; /terms is the contractor
                agreement, which is a different audience entirely. */}
            <a href="/legal/customer-terms-and-conditions.pdf">Customer terms (PDF)</a>
            <a href="/legal/customer-service-charter.pdf">Service charter (PDF)</a>
            <Link href="/terms">Contractor terms</Link>
          </nav>
        </div>

        <div className={styles.bottom}>
          <span>
            © {year} {COMPANY_REG_LINE}
          </span>
          <span>{SITE_LOCATION_LINE}</span>
        </div>
      </div>
    </footer>
  );
}
