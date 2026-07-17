import Link from 'next/link';
import styles from './SubNav.module.css';

const TABS = [
  { href: '/admin/seo', label: 'Overview' },
  { href: '/admin/seo/trends', label: 'Trends' },
  { href: '/admin/seo/queries', label: 'Queries' },
  { href: '/admin/seo/pages', label: 'Pages' },
];

export function SubNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="Search Console sections">
      <ul>
        {TABS.map((tab) => {
          const isActive = active === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={isActive ? styles.activeLink : styles.link}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
