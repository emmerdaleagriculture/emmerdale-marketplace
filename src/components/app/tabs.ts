import type { ViewerRole } from '@/components/useViewer';

/**
 * The app's bottom tabs (PRD task 1).
 *
 *   Customers:    Home · My jobs · Messages · Account
 *   Contractors:  Jobs · Diary · Messages · Earnings
 *
 * Each points at an existing page where one exists. "Diary" is the won-jobs
 * list and "Earnings" the contractor dashboard, which already carries the
 * money numbers; the dedicated diary and earnings screens are task 9 and
 * will take these slots over without the tab bar changing shape.
 *
 * `badge` names the count from /api/app/badges that sits on the icon.
 */
export type BadgeKey = 'invites' | 'prices' | 'messages';
export type TabIcon = 'home' | 'jobs' | 'messages' | 'account' | 'board' | 'diary' | 'earnings';

export type Tab = {
  key: string;
  label: string;
  href: string;
  icon: TabIcon;
  badge?: BadgeKey;
  /** Other paths that light this tab up (inner screens of it). */
  also?: string[];
};

export const CUSTOMER_TABS: Tab[] = [
  { key: 'home', label: 'Home', href: '/app/home', icon: 'home', also: ['/start'] },
  { key: 'jobs', label: 'My jobs', href: '/my', icon: 'jobs', badge: 'prices' },
  { key: 'messages', label: 'Messages', href: '/messages', icon: 'messages', badge: 'messages' },
  { key: 'account', label: 'Account', href: '/app/account', icon: 'account' },
];

export const CONTRACTOR_TABS: Tab[] = [
  { key: 'jobs', label: 'Jobs', href: '/invitations', icon: 'board', badge: 'invites', also: ['/jobs', '/quote'] },
  { key: 'diary', label: 'Diary', href: '/won', icon: 'diary' },
  { key: 'messages', label: 'Messages', href: '/messages', icon: 'messages', badge: 'messages' },
  { key: 'earnings', label: 'Earnings', href: '/account', icon: 'earnings', also: ['/onboarding'] },
];

/**
 * Which set a viewer gets. Someone who is both (a contractor who has booked
 * work through the site) gets the contractor bar; their customer side is a
 * link from the dashboard, as on the website. 'account' — signed in with
 * neither row, a contractor part-way through signing up — gets no bar.
 */
export function tabsFor(role: ViewerRole | null): Tab[] | null {
  if (role === 'customer') return CUSTOMER_TABS;
  if (role === 'contractor' || role === 'both') return CONTRACTOR_TABS;
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
