'use client';

import { useActionState, useState } from 'react';
import { deleteJobAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/** Statuses admin_delete_submission accepts; anything later is money or an award. */
const DELETABLE = new Set([
  'draft',
  'confirmed',
  'abandoned',
  'distributed',
  'quotes_receiving',
  'cancelled',
  'no_matches',
  'no_quotes',
  'expired',
]);

/**
 * Deletes a job and everything attached to it — for test jobs and junk. Two
 * steps with a reason, because it cannot be undone and the job's own audit
 * log goes with it; the reason travels in the email that records the delete.
 * The server refuses anything past award or payment regardless of what this
 * shows.
 */
export function DeleteJobButton({ submissionId, status }: { submissionId: string; status: string }) {
  const [state, act, pending] = useActionState(deleteJobAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (!DELETABLE.has(status)) {
    return (
      <p className={f.hint}>
        This job can&rsquo;t be deleted at &ldquo;{status}&rdquo; — it involves money or an
        award. Cancel it instead.
      </p>
    );
  }

  if (!asking) {
    return (
      <button type="button" className={f.btnGhost} onClick={() => setAsking(true)}>
        Delete job…
      </button>
    );
  }

  const live = status === 'distributed' || status === 'quotes_receiving';
  return (
    <form action={act} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <p className={f.hint} style={{ margin: 0 }}>
        This permanently removes the job, its invitations, prices and history. It can&rsquo;t
        be undone.
        {live &&
          ' Contractors have already been sent this job — their links will stop working.'}
      </p>
      <input
        className={f.input}
        name="reason"
        placeholder="Why? e.g. test job"
        required
        maxLength={200}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className={f.btnPrimary} disabled={pending}>
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setAsking(false)}>
          Keep it
        </button>
      </div>
      {state.error && <p className={f.error}>{state.error}</p>}
    </form>
  );
}
