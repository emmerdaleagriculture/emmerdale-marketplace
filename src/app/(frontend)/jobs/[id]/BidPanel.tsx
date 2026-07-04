'use client';

import { useActionState } from 'react';
import { placeBidAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import j from '../jobs.module.css';

export function BidPanel({
  jobId,
  currentAmountPence,
  currentNote,
}: {
  jobId: string;
  currentAmountPence?: number | null;
  currentNote?: string | null;
}) {
  const [state, action, pending] = useActionState(placeBidAction, emptyFormState);
  const hasBid = typeof currentAmountPence === 'number';

  return (
    <div className={j.panel}>
      <div className={j.panelTitle}>{hasBid ? 'Revise your bid' : 'Place a bid'}</div>
      {hasBid && (
        <p className={f.hint} style={{ marginBottom: 12 }}>
          Your current bid is £{(currentAmountPence! / 100).toFixed(2)}. Bids stay
          sealed — other contractors can’t see your amount.
        </p>
      )}
      <form action={action}>
        {state.error && <p className={f.error}>{state.error}</p>}
        {state.ok && <p className={f.success}>{state.message}</p>}
        <input type="hidden" name="job_id" value={jobId} />
        <label className={f.field}>
          <span className={f.label}>Your price (£)</span>
          <input
            className={f.input}
            type="number"
            name="amount"
            min="1"
            step="0.01"
            required
            defaultValue={hasBid ? (currentAmountPence! / 100).toString() : ''}
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Note to the customer (optional)</span>
          <textarea
            className={f.textarea}
            name="note"
            maxLength={500}
            defaultValue={currentNote ?? ''}
            placeholder="A short pitch — availability, what’s included, etc."
          />
        </label>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Submitting…' : hasBid ? 'Update bid' : 'Submit bid'}
        </button>
      </form>
    </div>
  );
}
