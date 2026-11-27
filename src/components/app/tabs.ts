import type { ViewerRole } from '@/components/useViewer';

/**
 * The app's bottom tabs (PRD task 1).
 *
 *   Customers:    Home · My jobs · Messages · Info · Account
 *   Contractors:  Dashboard · Earnings · [Books] · Diary · Info · Messages · Jobs
 *                 (Books for every contractor since 2026-11-20; Jobs at the right,
 *                 beside the Back slot AppShell adds on inner screens)
 *
 * Each points at an existing page where one exists. "Diary" is the user's
 * own diary (/app/diary, 2026-11-17); the won-jobs list it used to open is a
 * row at the top of it and keeps the tab lit. "Earnings" is the contractor
 * dashboard, which carries the money numbers.
 *
 * "Info" (2026-11-27) is the facts-and-tools section, /info and every page
 * under it. It first shipped as an (i) in the corner of each tab's header;
 * the user wanted it on the bar itself, as an icon like the rest.
 *
 * `badge` names the count from /api/app/badges that sits on the icon.
 */
export type BadgeKey = 'invites' | 'prices' | 'messages';
export type TabIcon = 'home' | 'jobs' | 'messages' | 'account' | 'board' | 'diary' | 'earnings' | 'dashboard' | 'books' | 'info';

export type Tab = {
  key: string;
  label: string;
  href: string;
  icon: TabIcon;
  badge?: BadgeKey;
  /** Other paths that light this tab up (inner screens of it). */
  also?: string[];
};

export const INFO_TAB: Tab = { key: 'info', label: 'Info', href: '/info', icon: 'info' };

export const CUSTOMER_TABS: Tab[] = [
  { key: 'home', label: 'Home', href: '/app/home', icon: 'home', also: ['/start'] },
  { key: 'jobs', label: 'My jobs', href: '/my', icon: 'jobs', badge: 'prices' },
  { key: 'messages', label: 'Messages', href: '/messages', icon: 'messages', badge: 'messages' },
  INFO_TAB,
  { key: 'account', label: 'Account', href: '/app/account', icon: 'account' },
];

export const CONTRACTOR_TABS: Tab[] = [
  // The website's dashboard, app-aware already; its settings and market
  // screens sit under it.
  { key: 'dashboard', label: 'Dashboard', href: '/account', icon: 'dashboard' },
  { key: 'earnings', label: 'Earnings', href: '/app/earnings', icon: 'earnings', also: ['/onboarding'] },
  { key: 'diary', label: 'Diary', href: '/app/diary', icon: 'diary', also: ['/won'] },
  INFO_TAB,
  { key: 'messages', label: 'Messages', href: '/messages', icon: 'messages', badge: 'messages' },
  { key: 'jobs', label: 'Jobs', href: '/invitations', icon: 'board', badge: 'invites', also: ['/jobs', '/quote'] },
];

/**
 * Books, beside Earnings, for contractors who can use it in the app
 * (2026-11-19): released to them and on Premium, the same test the
 * dashboard's Books link uses in the app. Its pages sit under /account, so
 * it is the longer match there and lights up instead of Dashboard.
 */
export const BOOKS_TAB: Tab = { key: 'books', label: 'Books', href: '/account/books', icon: 'books' };
const CONTRACTOR_TABS_WITH_BOOKS: Tab[] = CONTRACTOR_TABS.flatMap((t) => (t.key === 'earnings' ? [t, BOOKS_TAB] : [t]));

/**
 * Which set a viewer gets. Someone who is both (a contractor who has booked
 * work through the site) gets the contractor bar; their customer side is a
 * link from the dashboard, as on the website. 'account' — signed in with
 * neither row, a contractor part-way through signing up — gets no bar.
 */
export function tabsFor(role: ViewerRole | null, opts: { books?: boolean } = {}): Tab[] | null {
  if (role === 'customer') return CUSTOMER_TABS;
  if (role === 'contractor' || role === 'both') return opts.books ? CONTRACTOR_TABS_WITH_BOOKS : CONTRACTOR_TABS;
  return null;
}

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The tab a path belongs to: longest match wins, like the site header. */
export function activeTab(tabs: Tab[], pathname: string): Tab | null {
  let best: Tab | null = null;
  let bestLen = -1;
  for (const t of tabs) {
    for (const h of [t.href, ...(t.also ?? [])]) {
      if (under(pathname, h) && h.length > bestLen) {
        best = t;
        bestLen = h.length;
      }
    }
  }
  return best;
}

/** True on a tab's own page, as opposed to a screen reached from one. */
export function isTabRoot(tabs: Tab[], pathname: string): boolean {
  return tabs.some((t) => t.href === pathname);
}
