'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Settings used to live at /account#settings, and emails already sent (the
 * Premium listing enquiry) link there. The hash never reaches the server, so
 * the dashboard forwards it here.
 */
export function SettingsHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash === '#settings') router.replace('/account/settings');
  }, [router]);
  return null;
}
