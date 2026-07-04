'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updatePasswordAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { SiteFooter } from '@/components/SiteFooter';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState(updatePasswordAction, emptyFormState);

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
          <h1 className={a.title}>Set a new password</h1>
          <p className={a.sub}>Choose a new password for your account.</p>

          <form action={action} className={a.card}>
            {state.error && <p className={f.error}>{state.error}</p>}
            <label className={f.field}>
              <span className={f.label}>New password</span>
              <input
                className={f.input}
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <div className={a.actions}>
              <button className={f.btnPrimary} type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save new password'}
              </button>
            </div>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
