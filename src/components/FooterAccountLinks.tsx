'use client';

import Link from 'next/link';
import { useViewer } from './useViewer';

/**
 * The footer's account links. "Join as a contractor" and "Log in" are for
 * visitors; someone already signed in gets the way back to their own side.
 * Client-side for the same reason as the header: the footer is on every
 * cached page.
 */
export function FooterAccountLinks() {
  const viewer = useViewer();

  if (!viewer.signedIn) {
    return (
      // display: contents keeps the links laid out as the footer's own;
      // data-viewer-slot hides them until the viewer is known (useViewer).
      <span data-viewer-slot style={{ display: 'contents' }}>
        <Link href="/signup">Join as a contractor</Link>
        <Link href="/login">Log in</Link>
      </span>
    );
  }

  const { role } = viewer;
  return (
    <>
      {(role === 'contractor' || role === 'both') && <Link href="/account">Your dashboard</Link>}
      {(role === 'customer' || role === 'both') && <Link href="/my">My jobs</Link>}
      {role === 'account' && <Link href="/account">Your account</Link>}
    </>
  );
}
