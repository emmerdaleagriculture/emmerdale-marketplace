'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Render stamps already shown in this tab. */
const shown = new Set<string>();

/**
 * Going back to a page shows the router's saved copy of it, figures and
 * all: after opening Council tenders the dashboard still said "1 new". Each
 * render carries a fresh stamp; seeing one a second time means this is the
 * saved copy, so fetch the page again. A first visit costs nothing.
 */
export function FreshOnReturn({ stamp }: { stamp: string }) {
  const router = useRouter();
  useEffect(() => {
    if (shown.has(stamp)) router.refresh();
    else shown.add(stamp);
  }, [stamp, router]);
  return null;
}
