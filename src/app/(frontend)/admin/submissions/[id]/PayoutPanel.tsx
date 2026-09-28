'use client';

import { useActionState, useState } from 'react';
import { recordPayoutAction, removePayoutAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

type Payout = { amount: string; paidOn: string; note: string | null };

/**
 * The contractor's payout on a job: recorded, or the form to record it.
 *
 * Payouts are sent by hand; this only writes down that one went, so the
 * money page stops counting the job as owed. The form starts from the
 * contractor's price and today, because that is what almost every payout is.
 */
export function PayoutPanel({
  submissionId,
  payout,
  suggestedPounds,
  today,
}: {
  submissionId: string;
  payout: Payout | null;
  suggestedPounds: string;
  today: string;
}) {
  const [recordState, record, recording] = useActionState(recordPayoutAction, EMPTY);
  const [removeState, remove, removing] = useActionState(removePayoutAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  if (payout) {
    return (
      <div>
        <strong>Paid {payout.amount}</strong> on {payout.paidOn}
        {payout.note && <> · {payout.note}</>}
        {!confirming ? (
          <button
            type="button"
            className={f.btnGhost}
            onClick={() => setConfirming(true)}
            style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8 }}
          >
            Remove
          </button>
        ) : (
          <form action={remove} style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
            <input type="hidden" name="submission_id" value={submissionId} />
            <button type="submit" className={f.btnGhost} disabled={removing} style={{ padding: '2px 8px', fontSize: 11 }}>
              {removing ? 'Removing…' : 'Yes, remove the record'}
            </button>
            <button
              type="button"
              className={f.btnGhost}
              onClick={() => setConfirming(false)}
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              Keep it
            </button>
          </form>
        )}
        {removeState.error && <p className={f.error}>{removeState.error}</p>}
      </div>
    );
  }

  return (
    <form action={record} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <label className={f.field} style={{ margin: 0 }}>
        <span className={f.label}>Amount sent (£)</span>
        <input
          className={f.input}
          name="amount"
          inputMode="decimal"
          defaultValue={suggestedPounds}
          required
          style={{ width: 110 }}
        />
      </label>
      <label className={f.field} style={{ margin: 0 }}>
        <span className={f.label}>Paid on</span>
        <input className={f.input} type="date" name="paid_on" defaultValue={today} max={today} required />
      </label>
      <label className={f.field} style={{ margin: 0, flex: '1 1 180px' }}>
        <span className={f.label}>Note (optional)</span>
        <input className={f.input} name="note" maxLength={200} placeholder="e.g. bank ref" />
      </label>
      <button type="submit" className={f.btnPrimary} disabled={recording}>
        {recording ? 'Saving…' : 'Record payout'}
      </button>
      {recordState.error && <p className={f.error} style={{ width: '100%' }}>{recordState.error}</p>}
    </form>
  );
}
