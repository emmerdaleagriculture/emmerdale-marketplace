import Link from 'next/link';
import { AccountLink } from './AccountLink';
import { BrandMark } from './BrandMark';
import { FOOTER_HOME_SERVICES } from '@/lib/home/services';
import { servicePagePath } from '@/lib/services';
import { COMPANY_LEGAL_NAME, COMPANY_REG_LINE, COMPANY_ADDRESS_LINES } from '@/lib/site';
import s from './home.module.css';

/** Front-page footer: dark ink, brand column plus four link columns. */
export function HomeFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={s.footer} data-app-hide>
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
            {/* Real pages, not "#services" anchors: the anchor went nowhere
                from /contact and /start, and the home page — the most-linked
                page on the site — linked to none of its service pages. */}
            <h3 className={s.footerHeading}>Services</h3>
            <ul className={s.footerList}>
              {FOOTER_HOME_SERVICES.map((svc) => {
                const href = servicePagePath(svc.slug);
                return (
                  <li key={svc.slug}>
                    {href ? <Link href={href}>{svc.name}</Link> : <Link href="/#services">{svc.name}</Link>}
                  </li>
                );
              })}
              <li>
                <Link href="/services">All services</Link>
              </li>
            </ul>
          </div>

          <div>
            {/* The three hubs. Until 2026-10-11 nothing on the home page
                linked to them; they were reachable only from interior pages. */}
            <h3 className={s.footerHeading}>Looking for</h3>
            <ul className={s.footerList}>
              <li>
                <Link href="/paddock-maintenance">Paddock maintenance</Link>
              </li>
              <li>
                <Link href="/hay-bales">Hay, straw &amp; haylage</Link>
              </li>
              <li>
                <Link href="/tractor-hire">Tractor hire for events</Link>
              </li>
              <li>
                <Link href="/#how-it-works">How it works</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={s.footerHeading}>Company</h3>
            <ul className={s.footerList}>
              <li>
                <Link href="/notes">Notes from the field</Link>
              </li>
              <li>
                {/* Was a bare `#operators` fragment, which went nowhere from
                    any page but the homepage. */}
                <Link href="/agriculturalcontractors">Are you a contractor?</Link>
              </li>
              <li>
                {/* One login for both sides now, so it is no longer the
                    contractors' door. */}
                <AccountLink />
              </li>
              <li>
                <Link href="/contact">Contact us</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={s.footerHeading}>Legal</h3>
            <ul className={s.footerList}>
              <li>
                <Link href="/customer-terms">Customer terms</Link>
              </li>
              <li>
                <Link href="/service-charter">Service charter</Link>
              </li>
              <li>
                <Link href="/terms">Contractor terms</Link>
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
