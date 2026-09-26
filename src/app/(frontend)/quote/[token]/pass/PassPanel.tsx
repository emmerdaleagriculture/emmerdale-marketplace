'use client';

import { useActionState, useState } from 'react';
import { declineInvitationAction, undoDeclineAction, type QuoteActionState } from '../actions';
import f from '@/components/forms/forms.module.css';
import q from '../quote.module.css';

const EMPTY: QuoteActionState = {};

const REASONS = [
  { value: 'too_far', label: 'Too far' },
  { value: 'too_busy', label: 'Too busy right now' },
  { value: 'wrong_service', label: 'Not the kind of work I do' },
];

/**
 * After the email's pass link has done its work: the pass is already
 * recorded, so this is only ever a refinement (why?) or a reversal (oops).
 * Neither is required — the page has done its job the moment it loads.
 */
export function PassPanel({ token, reason }: { token: string; reason: string | null }) {
  const [refine, refineAction, refining] = useActionState(declineInvitationAction, EMPTY);
  const [undo, undoAction, undoing] = useActionState(undoDeclineAction, EMPTY);
  const [picked, setPicked] = useState('');

  return (
    <>
      <form action={refineAction} className={q.declineBlock}>
        {refine.error && <p className={f.error}>{refine.error}</p>}
        {refine.ok ? (
          <p className={f.success}>Thanks — that helps us send you the right jobs.</p>
        ) : (
          <>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="reason" value={picked} />
            <span className={f.hint}>Was there a reason? One tap, entirely optional:</span>
            <div className={f.chips}>
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="submit"
                  className={`${f.chip} ${reason === r.value ? f.chipOn : ''}`}
                  disabled={refining || undoing}
                  onClick={() => setPicked(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </form>

      <form action={undoAction} className={q.declineBlock}>
        {undo.error && <p className={f.error}>{undo.error}</p>}
        <input type="hidden" name="token" value={token} />
        <span className={f.hint}>Tapped by mistake, or changed your mind?</span>
        <div className={f.chips}>
          <button type="submit" className={f.chip} disabled={undoing || refining}>
            {undoing ? 'Reopening…' : 'Undo — I want to price this job'}
          </button>
        </div>
      </form>
    </>
  );
}
