'use client';

import { useActionState } from 'react';
import { declineInvitationAction, undoDeclineAction, type QuoteActionState } from '../actions';
import { ReasonChips } from '../DeclineForm';
import f from '@/components/forms/forms.module.css';
import q from '../quote.module.css';

const EMPTY: QuoteActionState = {};

/**
 * The landing for the email's pass link. Nothing is recorded by arriving —
 * link scanners in Outlook and Gmail follow every URL in an email, and a
 * pass they recorded would lock a contractor out of pricing without their
 * ever seeing this page. So the tap that counts is the reason chip here,
 * and the page's job is to make that the only thing on it.
 *
 * `declined` is the state on load; a chip tap moves to the passed panel
 * without a reload, and undo lands on the pricing page.
 */
export function PassPanel({ token, declined }: { token: string; declined: boolean }) {
  const [pass, passAction, passing] = useActionState(declineInvitationAction, EMPTY);
  const [undo, undoAction, undoing] = useActionState(undoDeclineAction, EMPTY);
  const passed = declined || Boolean(pass.ok);

  return (
    <>
      {passed ? (
        <div className={q.closedPanel}>
          <strong>Passed — thanks for the quick answer.</strong> We won&rsquo;t chase you
          about this job again. Nothing else is needed from you.
        </div>
      ) : (
        <form action={passAction} className={q.declineBlock}>
          {pass.error && <p className={f.error}>{pass.error}</p>}
          <input type="hidden" name="token" value={token} />
          <span className={f.hint}>
            Not one for you? One tap and we&rsquo;ll stop chasing this job:
          </span>
          <ReasonChips disabled={passing} />
        </form>
      )}

      <form action={undoAction} className={q.declineBlock}>
        {undo.error && <p className={f.error}>{undo.error}</p>}
        <input type="hidden" name="token" value={token} />
        <span className={f.hint}>
          {passed ? 'Tapped by mistake, or changed your mind?' : 'Want to see the job first?'}
        </span>
        <div className={f.chips}>
          <button type="submit" className={f.chip} disabled={undoing || passing}>
            {undoing ? 'One moment…' : passed ? 'Undo — I want to price this job' : 'Open the job to price it'}
          </button>
        </div>
      </form>
    </>
  );
}
