'use client';

import { useActionState } from 'react';
import { moderateMessageAction } from './distribution-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

/** Approve or reject one held message, from inside the conversation. */
export function ModerateMessage({ submissionId, messageId }: { submissionId: string; messageId: string }) {
  const [state, act, pending] = useActionState(moderateMessageAction, EMPTY);
  if (state.ok) return <small>Done</small>;
  return (
    <form action={act} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="message_id" value={messageId} />
      <button type="submit" name="decision" value="approve" className={f.btnGhost} disabled={pending}
        style={{ padding: '3px 10px', fontSize: 12 }}>
        Approve and deliver
      </button>
      <button type="submit" name="decision" value="reject" className={f.btnGhost} disabled={pending}
        style={{ padding: '3px 10px', fontSize: 12, color: '#a3261b' }}>
        Reject
      </button>
      {state.error && <small className={f.error}>{state.error}</small>}
    </form>
  );
}
