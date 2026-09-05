'use client';

import { useActionState, useState } from 'react';
import { cancelJobAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * Cancelling before work starts (terms 9.1).
 *
 * Two steps on purpose. It moves real money and stands a contractor down, and
 * the customer keeps only 85% — so the amount they get back is stated in the
 * confirmation rather than discovered afterwards.
 */
export function CancelJob({ token, refundLabel, feeLabel }: {
  token: string;
  refundLabel: string;
  feeLabel: string;
}) {
  const [state, action, pending] = useActionState(cancelJobAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  return (
    <div className={m.awardPanel}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {!confirming ? (
        <>
          <p>
            Need to cancel? You can, any time before the work starts.
          </p>
          <button className={f.btnGhost} type="button" onClick={() => setConfirming(true)}>
            Cancel this job
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>Cancel this job?</strong> We&rsquo;ll refund{' '}
            <strong>{refundLabel}</strong> to the card you paid with, usually within 5
            working days. We keep {feeLabel} — the 15% cancellation fee in our terms,
            covering the matching and scheduling already done.
          </p>
          <p>Your contractor will be told straight away. This can&rsquo;t be undone.</p>
          <form action={action} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="hidden" name="token" value={token} />
            <button className={f.btnPrimary} type="submit" disabled={pending}>
              {pending ? 'Cancelling…' : `Yes, cancel and refund ${refundLabel}`}
            </button>
            <button
              className={f.btnGhost}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep the job
            </button>
          </form>
        </>
      )}
    </div>
  );
}
