'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { claimJobAction } from '../actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * Keep this job. Holding the link is what proves it's yours, so this is the
 * only place an account can start — and once one job is attached, the rest of
 * that email's jobs come with it.
 */
export function SaveToAccount({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState(claimJobAction, EMPTY);

  return (
    <div className={m.awardPanel}>
      <p>
        <strong>Keep this job.</strong> Save it to an account and you can order the same
        work again in a couple of taps, or have it go out on its own every few months.
      </p>
      {!signedIn ? (
        <p>
          <Link className={f.btnPrimary} href={`/signup?next=${encodeURIComponent(`/my/${token}`)}`}>
            Create an account
          </Link>{' '}
          <Link href={`/login?next=${encodeURIComponent(`/my/${token}`)}`}>
            or log in if you already have one
          </Link>
        </p>
      ) : state.ok ? (
        <p className={f.success}>
          {state.message} <Link href="/my">See your jobs →</Link>
        </p>
      ) : (
        <form action={action}>
          {state.error && <p className={f.error}>{state.error}</p>}
          <input type="hidden" name="token" value={token} />
          <button className={f.btnPrimary} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save to my account'}
          </button>
        </form>
      )}
    </div>
  );
}
