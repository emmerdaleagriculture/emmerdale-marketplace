'use client';

import { useActionState, useState } from 'react';
import { withdrawJobAction } from './withdraw';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

const REASONS: [string, string][] = [
  ['done_elsewhere', 'I’ve had it done by someone else'],
  ['booked_direct', 'I booked one of these contractors directly'],
  ['not_needed', 'I don’t need it done any more'],
  ['other', 'Something else'],
];

/**
 * Taking an open job back. Until 2 Oct 2026 a job out for prices could only
 * expire; a customer who had it done elsewhere had to email us. Asks why
 * first: "booked one of these contractors directly" is the one answer that
 * tells us work left the platform, and who took it.
 */
export function WithdrawJob({
  token,
  contractors,
  hasAccount,
}: {
  token: string;
  /** The contractors on this job, as the customer knows them. */
  contractors: { label: string; invitationId: string }[];
  hasAccount: boolean;
}) {
  const [state, action, pending] = useActionState(withdrawJobAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('');

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  if (!open) {
    return (
      <p className={m.fixLine}>
        Don&rsquo;t need this job any more?{' '}
        <button type="button" className={f.linkButton} onClick={() => setOpen(true)}>
          Withdraw it
        </button>
        .
      </p>
    );
  }

  return (
    <form action={action} className={m.awardPanel}>
      <input type="hidden" name="token" value={token} />
      {state.error && <p className={f.error}>{state.error}</p>}
      <p>
        <strong>Withdraw this job?</strong> The contractors who priced it will be told, and
        nothing more will come from it. Tell us why, so we know what happened:
      </p>
      <div className={f.field}>
        {REASONS.map(([value, label]) => (
          <label key={value} className={f.checkRow}>
            <input type="radio" name="reason" value={value} required checked={reason === value} onChange={() => setReason(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {reason === 'booked_direct' && contractors.length > 0 && (
        <label className={f.field}>
          <span className={f.label}>Which one?</span>
          <select className={f.input} name="invitation_id" defaultValue="">
            <option value="">I’d rather not say</option>
            {contractors.map((c) => (
              <option key={c.invitationId} value={c.invitationId}>
                {c.label}
              </option>
            ))}
          </select>
          <span className={f.hint}>
            Booking through us is how the price you were shown, and your protection if anything goes
            wrong, work. We won&rsquo;t contact you about it — it helps us keep the network honest.
          </span>
        </label>
      )}
      {!hasAccount && (
        <p className={f.hint}>
          Want your details removed as well? Reply to any email from us and we&rsquo;ll do it.
        </p>
      )}
      <div className={m.acceptButtons}>
        <button className={f.btnPrimary} type="submit" disabled={pending || !reason}>
          {pending ? 'Withdrawing…' : 'Withdraw this job'}
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </button>
      </div>
    </form>
  );
}
