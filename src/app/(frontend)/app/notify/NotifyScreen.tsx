'use client';

import { useState } from 'react';
import { registerPush } from '@/lib/app/push';
import { PUSH_ASKED_COOKIE } from '@/lib/app/pushCookie';
import ui from '../app-ui.module.css';
import s from './notify.module.css';

function markAsked() {
  try {
    document.cookie = `${PUSH_ASKED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {}
}

export function NotifyScreen({ next, side }: { next: string; side: 'customer' | 'contractor' }) {
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    setBusy(true);
    markAsked();
    // Only now the system prompt: the explainer above is the one chance to
    // say why before the phone asks.
    await registerPush({ ask: true });
    window.location.assign(next);
  }
  function notNow() {
    markAsked();
    window.location.assign(next);
  }

  const points =
    side === 'customer'
      ? [
          ['New prices', 'The moment an operator prices your job.'],
          ['Messages', 'When a contractor writes to you.'],
          ['Job done', 'When the work is marked complete, so you can sign it off.'],
        ]
      : [
          ['New jobs', 'Jobs near you, the moment they come in — first refusal included.'],
          ['Booked', 'When a customer accepts your price.'],
          ['Messages and payouts', 'When a customer writes, and when you have been paid.'],
        ];

  return (
    <main className={ui.screen}>
      <div className={s.hero} aria-hidden="true">
        <span className={s.bell}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" />
          </svg>
          <span className={s.dot}>1</span>
        </span>
      </div>
      <h1 className={ui.title}>Know the moment something happens</h1>
      <p className={s.lede}>
        {side === 'customer'
          ? 'Prices come in over a day or so, and the best ones get taken. A notification means you never find out late.'
          : 'Jobs are first come, first served. A notification means you hear before the job is gone.'}
      </p>
      <ul className={s.points}>
        {points.map(([t, b]) => (
          <li key={t} className={s.point}>
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
            <span>
              <b>{t}</b> {b}
            </span>
          </li>
        ))}
      </ul>
      <p className={ui.note}>Daytime only for anything that can wait. You can turn them off any time in Account.</p>
      <div className="appFooterCta">
        <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={turnOn} disabled={busy}>
          {busy ? 'One moment…' : 'Turn on notifications'}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnText}`} onClick={notNow} disabled={busy} style={{ marginTop: 6 }}>
          Not now
        </button>
      </div>
    </main>
  );
}
