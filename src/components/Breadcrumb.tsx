import Link from 'next/link';
import { jsonLd as serializeJsonLd } from '@/lib/jsonld';
import styles from './Breadcrumb.module.css';
import { siteUrl as resolveSiteUrl } from '@/lib/site';

export type Crumb = {
  /** Display label */
  label: string;
  /** href; omit on the final (current) crumb */
  href?: string;
};

type Props = {
  /**
   * Crumb trail in display order. The last item is treated as the
   * current page (no link, accent colour, aria-current).
   * Don't include "Home" — the component prepends it automatically.
   */
  items: Crumb[];
  /** Skip the "Home" prefix if a particular page wants something different. */
  skipHome?: boolean;
  /**
   * Emit BreadcrumbList JSON-LD. Defaults to true. Pass siteUrl explicitly
   * if you need absolute URLs for the structured data (otherwise relative).
   */
  jsonLd?: boolean;
  siteUrl?: string;
};

/** Ported from the HPM site — same markup, marketplace default site URL. */
export function Breadcrumb({ items, skipHome = false, jsonLd = true, siteUrl: siteUrlProp }: Props) {
  const trail: Crumb[] = skipHome ? items : [{ label: 'Home', href: '/' }, ...items];

  const lastIndex = trail.length - 1;
  // Always absolute: Google rejects BreadcrumbList items with relative URLs.
  const base = siteUrlProp ?? resolveSiteUrl();

  const itemListElement = trail.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.label,
    ...(c.href ? { item: `${base}${c.href}` } : {}),
  }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  };

  return (
    <>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        {trail.map((c, i) => {
          const isLast = i === lastIndex;
          return (
            <span key={`${c.label}-${i}`}>
              {i > 0 && <span className={styles.sep}>/</span>}
              {isLast || !c.href ? (
                <span
                  className={isLast ? styles.current : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {c.label}
                </span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
            </span>
          );
        })}
      </nav>
      {jsonLd && (
        // JSON-LD must render in the initial HTML — plain <script>, not
        // next/script (which is lazy / client-side only).
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      )}
    </>
  );
}
