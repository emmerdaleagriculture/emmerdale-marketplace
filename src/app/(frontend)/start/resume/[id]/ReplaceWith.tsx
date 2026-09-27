'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Swaps the current URL for `href` once on screen; renders nothing. */
export function ReplaceWith({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}
