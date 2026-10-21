'use client';

import Link from 'next/link';
import { useViewer, type Viewer } from '@/components/useViewer';

/**
 * "Log in" for visitors; the way back to their own side for someone already
 * signed in. Without it the front page offered a returning contractor "Log in"
 * on every visit, and /login merely bounced them on to the dashboard.
 *
 * Resolved in the browser (useViewer) so the front page stays static: it
 * renders "Log in" first and swaps on hydration.
 */
export function AccountLink({
  viewer: known,
  className,
  onClick,
}: {
  /** Already resolved by the header; looked up here only when absent. */
  viewer?: Viewer;
  className?: string;
  onClick?: () => void;
}) {
  const viewer = useViewer(known);

  const { href, label } = !viewer.signedIn
    ? { href: '/login', label: 'Log in' }
    : viewer.role === 'customer'
      ? { href: '/my', label: 'My jobs' }
      : viewer.role === 'account'
        ? { href: '/account', label: 'Account' }
        : { href: '/account', label: 'Dashboard' };

  return (
    <Link href={href} className={className} onClick={onClick} data-viewer-slot>
      {label}
    </Link>
  );
}
