'use client';

import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/app/isApp';
import { pushPermission, registerPush, revokePush, type PushPermission } from '@/lib/app/push';
import ui from '@/app/(frontend)/app/app-ui.module.css';

/**
 * The "Push notifications" row on the Account screens: on, off, or blocked
 * at the system level (then the switch opens nothing and the row says to
 * use the phone's Settings). Renders nothing outside the native app.
 */
export function PushToggleRow() {
  const [native, setNative] = useState(false);
  const [perm, setPerm] = useState<PushPermission>('unavailable');
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    (async () => {
      const p = await pushPermission();
      setPerm(p);
      if (p === 'granted') {
        const r = await fetch('/api/app/device-token', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        setOn((r?.devices ?? 0) > 0);
      }
    })();
  }, []);

  if (!native) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await revokePush();
        setOn(false);
      } else {
        const p = await registerPush({ ask: true });
        setPerm(p);
        setOn(p === 'granted');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={ui.row} onClick={toggle} disabled={busy || perm === 'denied'} aria-pressed={on}>
      <span className={ui.rowIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" />
        </svg>
      </span>
      <span>
        Push notifications
        {perm === 'denied' && (
          <span className={ui.cardSub}>Turned off in your phone&rsquo;s Settings for this app.</span>
        )}
      </span>
      <span className={ui.rowValue}>
        <span className={`${ui.switch} ${on ? ui.switchOn : ''}`} aria-hidden="true" />
      </span>
    </button>
  );
}

/**
 * Log out that forgets this device first, so no push follows the person
 * out. A plain POST to /auth/signout everywhere else.
 */
export function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={(e) => {
        if (busy || !isNativeApp()) return;
        e.preventDefault();
        setBusy(true);
        const form = e.currentTarget;
        revokePush().finally(() => form.submit());
      }}
    >
      <button type="submit" className={className} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </form>
  );
}
