'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './SiteHeader.module.css';

/**
 * Auth-dependent header links, resolved in the browser. Renders the logged-out
 * state immediately (so pages using the header can be statically cached at the
 * CDN) and swaps to the signed-in links after checking the session client-side.
 * Admins don't need a dedicated link: /account redirects them to /admin.
 */
export function HeaderAuthNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  if (signedIn) {
    return (
      <>
        <Link href="/jobs">Jobs</Link>
        <Link href="/account">Account</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className={styles.linkButton}>
            Log out
          </button>
        </form>
      </>
    );
  }

  // Logged-out (and initial/unknown) state — correct for the vast majority of
  // landing-page visitors; signed-in users see the links swap on hydration.
  return (
    <>
      <Link href="/login">Log in</Link>
      <Link href="/signup" className={styles.cta}>
        Join the network
      </Link>
    </>
  );
}
