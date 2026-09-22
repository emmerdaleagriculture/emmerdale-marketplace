'use client';

import { useActionState, useState } from 'react';
import { clearClientNoteAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * Takes a contractor's note off the customer's price card. Nothing reviews a
 * note before it is published, so this is the retraction — sat next to the
 * note itself rather than in the operator panel, because you decide to pull
 * one the moment you read it.
 *
 * Two steps, because job_events refuses an operator action without a reason
 * and because the note is already in front of the customer: the second click
 * is the one that does it.
 */
export function ClearNoteButton({
  submissionId,
  clientQuoteId,
}: {
  submissionId: string;
  clientQuoteId: string;
}) {
  const [state, act, pending] = useActionState(clearClientNoteAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.ok) return <small> · cleared</small>;

  if (!asking) {
    return (
      <button
        type="button"
        className={f.btnGhost}
        onClick={() => setAsking(true)}
        style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8 }}
      >
        Clear
      </button>
    );
  }

  return (
    <form action={act} style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="client_quote_id" value={clientQuoteId} />
      <input
        className={f.input}
        name="reason"
        placeholder="Why are you pulling it?"
        required
        maxLength={200}
        style={{ fontSize: 12, padding: '4px 8px', minWidth: 180 }}
      />
      <button
        type="submit"
        className={f.btnGhost}
        disabled={pending}
        style={{ padding: '2px 8px', fontSize: 11 }}
      >
        {pending ? 'Clearing…' : 'Confirm'}
      </button>
      <button
        type="button"
        className={f.btnGhost}
        onClick={() => setAsking(false)}
        style={{ padding: '2px 8px', fontSize: 11 }}
      >
        Cancel
      </button>
      {state.error && <small className={f.error}>{state.error}</small>}
    </form>
  );
}
