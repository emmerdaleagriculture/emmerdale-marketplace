'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

/**
 * Admin navigation. Eleven flat links gave no sense of place and no sense of
 * relationship, so they're grouped by what you're doing rather than by which
 * part of the codebase they came from, and the current page is marked.
 *
 * Two tiers: the groups always visible, the current group's pages beneath.
 * The pages of whichever group you're in stay one click away, which matters
 * for Run — Ops, Queues and Money are read in sequence, not in isolation.
 *
 * Labels follow each page's own heading where the nav disagreed with it:
 * "Metrics" was headed Dashboard, "Reporting" was headed Landing page
 * reporting. Two words for the same idea is how you end up clicking both.
 */
const GROUPS: { name: string; items: { href: string; label: string }[] }[] = [
  {
    name: 'Run',
    items: [
      { href: '/admin/ops', label: 'Ops' },
      { href: '/admin/queues', label: 'Queues' },
      { href: '/admin/money', label: 'Money' },
      { href: '/admin/email', label: 'Email' },
    ],
  },
  {
    name: 'Intake',
    items: [
      { href: '/admin/submissions', label: 'Submissions' },
      { href: '/admin/leads', label: 'Leads' },
    ],
  },
  {
    name: 'Board',
    items: [
      { href: '/admin/jobs', label: 'Jobs' },
      { href: '/admin/contractors', label: 'Contractors' },
    ],
  },
  {
    name: 'Insight',
    items: [
      { href: '/admin/metrics', label: 'Dashboard' },
      { href: '/admin/reporting', label: 'Landing funnel' },
      { href: '/admin/seo', label: 'SEO' },
    ],
  },
  {
    name: 'Content',
    items: [{ href: '/admin/notes', label: 'Notes' }],
  },
];

/** Longest matching href wins, so /admin/seo/pages marks SEO, not /admin. */
function activeHref(pathname: string): string | null {
  const all = GROUPS.flatMap((g) => g.items.map((i) => i.href));
  const hits = all.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function AdminNav() {
  const pathname = usePathname() ?? '';
  const current = activeHref(pathname);
  // The index page belongs to no group; default to Run so the bar is never
  // a row of headings with nothing under it.
  const group =
    GROUPS.find((g) => g.items.some((i) => i.href === current)) ?? GROUPS[0];

  return (
    <div className={styles.navWrap}>
      <nav className={styles.groupRow} aria-label="Admin sections">
        {GROUPS.map((g) => (
          <Link
            key={g.name}
            href={g.items[0].href}
            className={g.name === group.name ? `${styles.group} ${styles.groupOn}` : styles.group}
            aria-current={g.name === group.name ? 'true' : undefined}
          >
            {g.name}
          </Link>
        ))}
      </nav>
      <nav className={styles.pageRow} aria-label={`${group.name} pages`}>
        {group.items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={i.href === current ? `${styles.page} ${styles.pageOn}` : styles.page}
            aria-current={i.href === current ? 'page' : undefined}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
