'use client';

import { useEffect, useState } from 'react';
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
 *
 * A group heading SWITCHES the row below it; it does not navigate. It used to
 * link to its own first item, which put five routes in the bar twice under two
 * names — /admin/ops as both "Run" and "Ops", /admin/metrics as both "Insight"
 * and "Dashboard" — 21 anchors for 16 destinations. Nobody can tell that Run
 * and Ops are the same page by looking. Browsing a group now costs a click and
 * reveals its pages instead of guessing which one you wanted.
 *
 * Search Console was the third navigation system in the admin: its own tab bar
 * in its own CSS module, rendered by four pages and the guard, for what is
 * plainly a group of pages. It is a group now, and that component is gone.
 */
const GROUPS: { name: string; items: { href: string; label: string }[] }[] = [
  {
    name: 'Run',
    items: [
      { href: '/admin/ops', label: 'Ops' },
      { href: '/admin/queues', label: 'Queues' },
      { href: '/admin/money', label: 'Money' },
      { href: '/admin/email', label: 'Email' },
      { href: '/admin/errors', label: 'Errors' },
      { href: '/admin/feedback', label: 'Feedback' },
      { href: '/admin/crons', label: 'Scheduled' },
    ],
  },
  {
    // /admin/leads still resolves (the lead-alert emails link straight to
    // it) but is no longer somewhere you navigate to, like /admin/jobs below.
    name: 'Intake',
    items: [{ href: '/admin/submissions', label: 'Submissions' }],
  },
  {
    // Was 'Board', for the legacy jobs board now being retired: portal
    // enquiries and lead conversions both publish into job_submissions, so
    // nothing new enters it. /admin/jobs still resolves while its last live
    // jobs are worked through — it is simply no longer somewhere you navigate
    // to, and the work it used to hold is on Intake › Submissions.
    name: 'Network',
    items: [
      { href: '/admin/contractors', label: 'Contractors' },
      { href: '/admin/coverage', label: 'Coverage' },
    ],
  },
  {
    name: 'Insight',
    items: [
      { href: '/admin/metrics', label: 'Dashboard' },
      { href: '/admin/reporting', label: 'Landing funnel' },
      { href: '/admin/reporting/sources', label: 'Sources' },
      // Reachable only from body links on three other pages until now.
      { href: '/admin/reporting/journey', label: 'Journey' },
      { href: '/admin/reporting/messages', label: 'Messages' },
    ],
  },
  {
    name: 'Search',
    items: [
      { href: '/admin/seo', label: 'Overview' },
      { href: '/admin/seo/trends', label: 'Trends' },
      { href: '/admin/seo/queries', label: 'Queries' },
      { href: '/admin/seo/pages', label: 'Pages' },
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
  const currentGroup =
    GROUPS.find((g) => g.items.some((i) => i.href === current)) ?? GROUPS[0];
  // Which group's pages are on show. Browsing another group's pages without
  // leaving this one is the whole reason the headings stopped being links.
  const [openName, setOpenName] = useState(currentGroup.name);
  // Navigating re-anchors the row to wherever you landed, so the bar never
  // sits open on a group you have since left.
  useEffect(() => setOpenName(currentGroup.name), [currentGroup.name]);
  const group = GROUPS.find((g) => g.name === openName) ?? currentGroup;

  return (
    <div className={styles.navWrap}>
      <nav className={styles.groupRow} aria-label="Admin sections">
        {GROUPS.map((g) => (
          <button
            key={g.name}
            type="button"
            onClick={() => setOpenName(g.name)}
            className={g.name === group.name ? `${styles.group} ${styles.groupOn}` : styles.group}
            // Pressed = showing its pages. The page row carries aria-current
            // for the page you are actually on.
            aria-pressed={g.name === group.name}
          >
            {g.name}
          </button>
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
