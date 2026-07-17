'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { requestResetAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { Turnstile, turnstileEnabled } from '@/components/forms/Turnstile';
import { SiteFooter } from '@/components/SiteFooter';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(requestResetAction, emptyFormState);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaPending = turnstileEnabled && !captchaToken;

  return (
    <div className={a.wrap}>
      <header style={{ background: 'var(--jd-green-deep)', padding: '18px 24px' }}>
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-display-stack)',
            color: 'var(--white)',
            fontSize: 18,
            letterSpacing: '0.03em',
          }}
        >
          Emmerdale Agriculture
        </Link>
      </header>
      <main className={a.main}>
        <div className={a.narrow}>
          <div className={a.eyebrow}>For contractors</div>
          <h1 className={a.title}>Reset your password</h1>
          <p className={a.sub}>Enter your email and we’ll send you a link to set a new password.</p>

          {state.ok ? (
            <div className={a.card}>
              <p className={f.success} style={{ fontSize: 16, marginBottom: 0 }}>
                {state.message}
              </p>
            </div>
          ) : (
            <form action={action} className={a.card}>
              {state.error && <p className={f.error}>{state.error}</p>}
              <label className={f.field}>
                <span className={f.label}>Email</span>
                <input className={f.input} type="email" name="email" required autoComplete="email" />
              </label>
              <Turnstile resetOn={state} onToken={setCaptchaToken} />
              <div className={a.actions}>
                <button className={f.btnPrimary} type="submit" disabled={pending || captchaPending}>
                  {pending ? 'Sending…' : 'Send reset link'}
                </button>
                <span className={a.altLink}>
                  <Link href="/login">Back to log in</Link>
                </span>
              </div>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
