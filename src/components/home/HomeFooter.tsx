import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { FOOTER_HOME_SERVICES } from '@/lib/home/services';
import { COMPANY_LEGAL_NAME, COMPANY_REG_LINE, COMPANY_ADDRESS_LINES } from '@/lib/site';
import s from './home.module.css';

/** Front-page footer: dark ink, brand column plus three link columns. */
export function HomeFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div className={s.footerGrid}>
          <div>
            <Link href="/" className={`${s.brand} ${s.brandFooter}`} aria-label="Emmerdale Agriculture home">
              <BrandMark className={s.brandMark} />
              <span className={s.brandWordmark}>Emmerdale Agriculture</span>
            </Link>
            <p className={s.footerTag}>A managed marketplace for rural land.</p>
            <address className={s.footerAddress}>
              {COMPANY_REG_LINE}
              <br />
              {COMPANY_ADDRESS_LINES.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </address>
          </div>

          <div>
            <h4 className={s.footerHeading}>Services</h4>
            <ul className={s.footerList}>
              {FOOTER_HOME_SERVICES.map((svc) => (
                <li key={svc.slug}>
                  <a href="#services">{svc.name}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={s.footerHeading}>Company</h4>
            <ul className={s.footerList}>
              <li>
                <Link href="/notes">Notes from the field</Link>
              </li>
              <li>
                <a href="#operators">Are you a contractor?</a>
              </li>
              <li>
                <Link href="/login">Contractor log in</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className={s.footerHeading}>Legal</h4>
            <ul className={s.footerList}>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className={s.footerBottom}>
          <p id="footnote-fees" className={s.footerNote}>
            * Subject to card and transfer charges.
          </p>
          <p>
            © {year} {COMPANY_LEGAL_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
