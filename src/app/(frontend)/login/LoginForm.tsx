'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { loginAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { Turnstile, turnstileEnabled } from '@/components/forms/Turnstile';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';

/**
 * One page, both routes.
 *
 * Customers and contractors share a single set of credentials — there is one
 * auth here, not two — so two separate forms would be a lie about how it
 * works and would leave people guessing which of them their password is for.
 * What they actually differ in is where they are going, so that is what the
 * page asks: pick a side, fill in one form, land in the right place.
 *
 * The choice is a preference, not a claim. Someone who picks Contractor but
 * has no contractor account is routed by what they actually are rather than
 * being dropped on a page that has nothing for them, and a ?next= from an
 * emailed link overrides both.
 */
type Side = 'customer' | 'contractor';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, emptyFormState);
  const [captchaToken, setCaptchaToken] = useState('');
  const [side, setSide] = useState<Side>('customer');
  const captchaPending = turnstileEnabled && !captchaToken;

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="side" value={side} />

      <div className={a.sideChoice} role="radiogroup" aria-label="Log in as">
        {(
          [
            ['customer', 'I booked a job', 'Your jobs, and order one again'],
            ['contractor', 'I do the work', 'Your invitations and won jobs'],
          ] as const
        ).map(([value, label, blurb]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={side === value}
            className={`${a.sideOption} ${side === value ? a.sideOptionOn : ''}`}
            onClick={() => setSide(value)}
          >
            <strong>{label}</strong>
            <span>{blurb}</span>
          </button>
        ))}
      </div>

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

      <Turnstile resetOn={state} onToken={setCaptchaToken} />

      <div className={a.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending || captchaPending}>
          {pending ? 'Logging in…' : 'Log in'}
        </button>
        <span className={a.altLink}>
          <Link href="/reset-password">Forgot password?</Link>
        </span>
      </div>
      <p className={a.altLink} style={{ marginTop: 18 }}>
        {side === 'contractor' ? (
          <>
            New here? <Link href="/signup">Join the network</Link> — it&rsquo;s free.
          </>
        ) : (
          <>
            No account yet? You get one by saving a job from the link we email you —{' '}
            <Link href="/start">tell us about the job</Link>.
          </>
        )}
      </p>
    </form>
  );
}
