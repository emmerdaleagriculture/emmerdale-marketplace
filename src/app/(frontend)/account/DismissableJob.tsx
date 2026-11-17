'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  declineInvitationAction,
  undoDeclineAction,
  type QuoteActionState,
} from '../quote/[token]/actions';
import { ReasonChips } from '../quote/[token]/DeclineForm';
import f from '@/components/forms/forms.module.css';
import ac from './account.module.css';

const EMPTY: QuoteActionState = {};

/**
 * A "job to price" row in Needs you now, with a Dismiss button beside it.
 *
 * Dismissing is the same pass as the invitation's own "not one for you?"
 * chips (decline_invitation): it records the reason, stops the chasers and
 * frees any members-first hold, rather than hiding the row only on this page
 * while the job keeps nagging by email and text. The row stays put as
 * "Passed · Undo" until the next load, so a slipped thumb is one tap back.
 */
export function DismissableJob({
  token,
  title,
  detail,
  cta,
  urgent,
}: {
  token: string;
  title: string;
  detail: string;
  cta: string;
  urgent?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [pass, passAction, passing] = useActionState(declineInvitationAction, EMPTY);
  const [undo, undoAction, undoing] = useActionState(undoDeclineAction, EMPTY);

  if (pass.ok) {
    return (
      <form action={undoAction} className={ac.dismissed}>
        <input type="hidden" name="token" value={token} />
        <span>
          Passed on <strong>{title}</strong>. We won&rsquo;t chase you about it again.
        </span>
        {undo.error && <span className={f.error}>{undo.error}</span>}
        <button type="submit" className={ac.dismissLink} disabled={undoing}>
          {undoing ? 'One moment…' : 'Undo'}
        </button>
      </form>
    );
  }

  return (
    <div className={ac.dismissable}>
      <div className={ac.dismissRow}>
        <Link
          href={`/quote/${token}`}
          prefetch={false}
          className={`${ac.action} ${urgent ? ac.actionUrgent : ''}`}
        >
          <span className={ac.actionText}>
            <span className={ac.actionTitle}>{title}</span>
            <span className={ac.actionDetail}>{detail}</span>
          </span>
          <span className={ac.actionCta}>{cta} →</span>
        </Link>
        <button
          type="button"
          className={ac.dismissButton}
          aria-expanded={asking}
          aria-label={`Dismiss ${title}`}
          onClick={() => setAsking((v) => !v)}
        >
          {asking ? 'Cancel' : 'Dismiss'}
        </button>
      </div>
      {asking && (
        <form action={passAction} className={ac.dismissForm}>
          <input type="hidden" name="token" value={token} />
          <span className={f.hint}>Not one for you? Pick a reason and we&rsquo;ll stop chasing:</span>
          {pass.error && <p className={f.error}>{pass.error}</p>}
          <ReasonChips disabled={passing} />
        </form>
      )}
    </div>
  );
}
