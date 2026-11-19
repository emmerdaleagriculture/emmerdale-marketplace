'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** While receipts are being read, refresh the page every few seconds. */
export function AutoRefresh({ active, every = 5000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}
