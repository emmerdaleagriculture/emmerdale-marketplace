'use client';

import { useActionState } from 'react';
import { clearClientNoteAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/**
 * Takes a contractor's note off the customer's price card. Nothing reviews a
 * note before it is published, so this is the retraction — sat next to the
 * note itself rather than in the operator panel, because you decide to pull
 * one the moment you read it.
 */
export function ClearNoteButton({
  submissionId,
  clientQuoteId,
}: {
  submissionId: string;
  clientQuoteId: string;
}) {
  const [state, act, pending] = useActionState(clearClientNoteAction, EMPTY);

  if (state.ok) return <small> · cleared</small>;

  return (
    <form action={act} style={{ display: 'inline' }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="client_quote_id" value={clientQuoteId} />
      <button
        type="submit"
        className={f.btnGhost}
        disabled={pending}
        style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8 }}
      >
        {pending ? 'Clearing…' : 'Clear'}
      </button>
      {state.error && <small className={f.error}> {state.error}</small>}
    </form>
  );
}
