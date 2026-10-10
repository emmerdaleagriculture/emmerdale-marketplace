import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeFooter } from '@/components/home/HomeFooter';
import a from './auth.module.css';

/**
 * A 404 with the site around it. Until 2026-10-11 an unknown address got
 * Next's bare default — "404: This page could not be found." on white, with
 * no header, no nav and nowhere to go — which is what a visitor following a
 * mistyped link from an email or a stale search result saw. The status code
 * was always right; only the page was missing.
 */
// Next adds the noindex tag to a not-found response itself.
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className={a.wrap}>
      <HomeHeader />
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>404</div>
          <h1 className={a.title}>We can&rsquo;t find that page.</h1>
          <p className={a.sub}>
            The address may be mistyped, or the page has moved. The places
            people usually want are below.
          </p>
          <div className={a.card}>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
              <li>
                <Link href="/paddock-maintenance">Get prices for paddock or field work</Link>
              </li>
              <li>
                <Link href="/hay-bales">Hay, straw &amp; haylage suppliers</Link>
              </li>
              <li>
                <Link href="/tractor-hire">Tractor hire for weddings and events</Link>
              </li>
              <li>
                <Link href="/services">Every service we price</Link>
              </li>
              <li>
                <Link href="/agriculturalcontractors">Join as a contractor</Link>
              </li>
              <li>
                <Link href="/notes">Notes from the field</Link>
              </li>
              <li>
                <Link href="/contact">Contact us</Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
