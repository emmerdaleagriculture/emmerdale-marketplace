'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, emptyFormState);

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}

      <label className={f.field}>
        <span className={f.label}>Email</span>
        <input className={f.input} type="email" name="email" required autoComplete="email" />
      </label>
      <label className={f.field}>
        <span className={f.label}>Password</span>
        <input
          className={f.input}
          type="password"
          name="password"
          required
          autoComplete="current-password"
        />
      </label>

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Logging in…' : 'Log in'}
        </button>
        <span className={a.altLink}>
          <Link href="/reset-password">Forgot password?</Link>
        </span>
      </div>
      <p className={a.altLink} style={{ marginTop: 18 }}>
        New here? <Link href="/signup">Join the network</Link>
      </p>
    </form>
  );
}
