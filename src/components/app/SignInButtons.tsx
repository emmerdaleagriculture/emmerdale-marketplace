'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appPlatform, isNativeApp } from '@/lib/app/isApp';
import { nativeProvidersAvailable, nativeSignIn, type NativeProvider } from '@/lib/app/nativeSignIn';
import f from '@/components/forms/forms.module.css';
import s from './SignInButtons.module.css';

/**
 * "Continue with Apple" and "Continue with Google", for the welcome screen
 * and the website's login and sign-up pages (PRD task 3).
 *
 * In the app the native sheets do the work and the session lands in the
 * browser client's cookies, so the page can navigate straight on. On the
 * website — and in the app on a platform whose sheet is not available —
 * Supabase's OAuth flow takes over: off to the provider, back through
 * /auth/callback, which exchanges the code and continues to `next`.
 *
 * Apple first on an iPhone, Google first on Android; on the web, Google
 * first. Both land on `next` ('/app/continue?role=…' in the app).
 */
export function SignInButtons({
  next,
  compact = false,
  dividerText,
}: {
  /** Same-site path to continue to once signed in; '' lets /auth/callback route by role. */
  next: string;
  /** Smaller buttons for the website's forms. */
  compact?: boolean;
  /** "or" line under the buttons, where a form follows. */
  dividerText?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<NativeProvider | null>(null);
  const [error, setError] = useState('');
  const [appleFirst, setAppleFirst] = useState(false);
  useEffect(() => setAppleFirst(appPlatform() === 'ios'), []);

  async function go(provider: NativeProvider) {
    setError('');
    setBusy(provider);
    try {
      if (isNativeApp() && nativeProvidersAvailable().includes(provider)) {
        const res = await nativeSignIn(provider);
        if (res.ok) {
          // A full navigation, not router.push: the server has to see the
          // new auth cookies before it decides where this person belongs.
          window.location.assign(next || '/app/continue');
          return;
        }
        if (!res.cancelled) setError(res.message);
        setBusy(null);
        return;
      }
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: next
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `${window.location.origin}/auth/callback`,
          // Google only re-issues a refresh token on a consenting sign-in,
          // and the account picker beats a silent sign-in to the wrong one.
          ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
        },
      });
      if (error) {
        setError(error.message);
        setBusy(null);
      }
      // Otherwise the browser is on its way to the provider.
    } catch (err) {
      console.error('[sign-in] failed:', err);
      setError('That sign-in did not go through. Please try again.');
      setBusy(null);
      router.refresh();
    }
  }

  const apple = (
    <button
      key="apple"
      type="button"
      className={`${s.btn} ${s.apple} ${compact ? s.compact : ''}`}
      onClick={() => go('apple')}
      disabled={busy !== null}
    >
      <AppleMark />
      {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
    </button>
  );
  const google = (
    <button
      key="google"
      type="button"
      className={`${s.btn} ${s.google} ${compact ? s.compact : ''}`}
      onClick={() => go('google')}
      disabled={busy !== null}
    >
      <GoogleMark />
      {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );

  return (
    <div className={s.wrap}>
      {appleFirst ? [apple, google] : [google, apple]}
      {error && <p className={f.error}>{error}</p>}
      {dividerText && (
        <div className={s.divider}>
          <span>{dividerText}</span>
        </div>
      )}
    </div>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.7c-.02-2.17 1.78-3.21 1.86-3.26-1.01-1.48-2.59-1.68-3.15-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.85-.75-1.46.02-2.82.85-3.57 2.17-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.59 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.83-1.22 1.18-2.4 1.2-2.46-.03-.01-2.31-.89-2.37-3.54ZM14.2 6.3c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.56-1.23Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.07-1.47-.22-2.12H12v3.85h6.6c-.13 1.08-.85 2.7-2.45 3.79l-.02.15 3.56 2.76.25.02c2.26-2.09 3.56-5.17 3.56-8.45Z" />
      <path fill="#34A853" d="M12 23.5c3.24 0 5.96-1.07 7.94-2.9l-3.79-2.93c-1.01.7-2.37 1.2-4.15 1.2-3.17 0-5.86-2.09-6.82-4.98l-.14.01-3.7 2.87-.05.13A11.98 11.98 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.18 13.89A7.4 7.4 0 0 1 4.78 11.5c0-.83.15-1.64.39-2.39l-.01-.16-3.75-2.91-.12.06A12 12 0 0 0 0 11.5c0 1.93.47 3.76 1.29 5.4l3.89-3.01Z" />
      <path fill="#EB4335" d="M12 4.13c2.25 0 3.77.97 4.63 1.78l3.38-3.3C17.94.67 15.24-.5 12-.5 7.3-.5 3.25 2.19 1.29 6.1l3.88 3.01C6.14 6.22 8.83 4.13 12 4.13Z" />
    </svg>
  );
}
