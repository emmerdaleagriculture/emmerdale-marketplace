'use client';

import { useEffect, useState } from 'react';
import { appPlatform, isNativeApp } from '@/lib/app/isApp';
import { pushPermission, pushSupported, pushTurnedOff, registerPush, revokePush, type PushPermission } from '@/lib/app/push';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/app/theme';
import ui from '@/app/(frontend)/app/app-ui.module.css';

/**
 * The "Push notifications" row, inside the Notifications drawer (contractors)
 * and on the customer's Account screen. This device's switch: on means the
 * phone allows notifications and nobody turned them off here, so another
 * phone signed in to the same account does not make it read "on".
 *
 * Every failure says so. It used to flick back to off without a word, and
 * on app 1.0.0, which has no push plugin, it could never do anything else.
 * Renders nothing outside the native app.
 */
export function PushToggleRow({ boxed = false }: { boxed?: boolean }) {
  const [native, setNative] = useState(false);
  const [supported, setSupported] = useState(true);
  const [perm, setPerm] = useState<PushPermission>('unavailable');
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    if (!pushSupported()) {
      setSupported(false);
      return;
    }
    pushPermission().then((p) => {
      setPerm(p);
      setOn(p === 'granted' && !pushTurnedOff());
    });
  }, []);

  if (!native) return null;

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (on) {
        await revokePush({ remember: true });
        setOn(false);
      } else {
        const p = await registerPush({ ask: true });
        setPerm(p);
        setOn(p === 'granted');
        if (p === 'unavailable') setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const store = appPlatform() === 'ios' ? 'the App Store' : 'Google Play';
  const note = !supported
    ? `Update the app from ${store} to turn these on.`
    : perm === 'denied'
      ? 'Turned off in your phone\u2019s Settings for this app.'
      : failed
        ? 'That didn\u2019t work. Check your signal and try again.'
        : null;

  const row = (
    <button type="button" className={ui.row} onClick={toggle} disabled={busy || !supported || perm === 'denied'} aria-pressed={on}>
      <span className={ui.rowIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" />
        </svg>
      </span>
      <span style={{ display: 'grid', gap: 2 }}>
        Push notifications
        {note && <span className={ui.cardSub}>{note}</span>}
      </span>
      <span className={ui.rowValue}>
        <span className={`${ui.switch} ${on ? ui.switchOn : ''}`} aria-hidden="true" />
      </span>
    </button>
  );
  // On its own (in the Notifications drawer) it needs the rows' card.
  return boxed ? (
    <div className={ui.rows} style={{ marginTop: 16 }}>
      {row}
    </div>
  ) : (
    row
  );
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings › Appearance: Auto (the phone's setting), Light or Dark, kept on
 * this device (src/lib/app/theme.ts). App only; the website has no dark mode.
 */
export function ThemeRow() {
  const [pref, setPref] = useState<ThemePref | null>(null);
  useEffect(() => setPref(getThemePref()), []);

  return (
    <div className={ui.row} role="group" aria-label="Appearance">
      <span className={ui.rowIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" />
        </svg>
      </span>
      <span>Appearance</span>
      <span className={ui.seg}>
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`${ui.segBtn} ${pref === t.value ? ui.segOn : ''}`}
            aria-pressed={pref === t.value}
            onClick={() => {
              setThemePref(t.value);
              setPref(t.value);
            }}
          >
            {t.label}
          </button>
        ))}
      </span>
    </div>
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
