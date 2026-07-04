import type { Metadata } from 'next';
import styles from './holding.module.css';
import {
  SITE_FOOTER_STRAPLINE,
  COMPANY_LEGAL_NAME,
  COMPANY_NUMBER,
  HPM_URL,
  SITE_LOCATION_LINE,
} from '@/lib/site';

export const metadata: Metadata = {
  title: 'Emmerdale Agriculture — The contractor network',
  description:
    'Paddock and land jobs across the country, passed to contractors who can actually do them. Launching soon.',
};

export default function HoldingPage() {
  const year = new Date().getFullYear();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.eyebrow}>The network</div>

          <h1 className={styles.headline}>
            Good jobs, passed to contractors who can <em>actually do them.</em>
          </h1>

          <p className={styles.lede}>
            Paddock and land work across the country — posted by Hampshire Paddock
            Management, matched to contractors by county, and awarded by bid.
          </p>

          <p className={styles.soon}>
            The network is being built. Contractor sign-up opens shortly.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.brand}>Emmerdale Agriculture</div>
          <div className={styles.tag}>{SITE_FOOTER_STRAPLINE}</div>
          <p className={styles.blurb}>
            The contractor network run by {COMPANY_LEGAL_NAME}, the company behind{' '}
            <a href={HPM_URL} className={styles.link}>
              Hampshire Paddock Management
            </a>
            .
          </p>

          <div className={styles.bottom}>
            <span>
              © {year} {COMPANY_LEGAL_NAME} · Company No. {COMPANY_NUMBER}
            </span>
            <span>{SITE_LOCATION_LINE}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
