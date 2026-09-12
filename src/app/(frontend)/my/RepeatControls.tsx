'use client';

import { useActionState } from 'react';
import { cancelScheduleAction, scheduleJobAction, switchScheduleModeAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

const EVERY = [
  { months: 3, label: 'every 3 months' },
  { months: 6, label: 'every 6 months' },
  { months: 12, label: 'once a year' },
];

/**
 * Set a job to go out again on its own, every few months. When the job had a
 * contractor, the customer also chooses who gets it: them first, or fresh
 * prices each time.
 */
export function RepeatSetup({
  submissionId,
  contractorName,
}: {
  submissionId: string;
  contractorName: string | null;
}) {
  const [state, action, pending] = useActionState(scheduleJobAction, EMPTY);

  if (state.ok) return <p className={f.success}>{state.message}</p>;

  return (
    <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="submission_id" value={submissionId} />
      <select className={f.input} name="interval_months" defaultValue="6" style={{ maxWidth: 190 }}>
        {EVERY.map((e) => (
          <option key={e.months} value={e.months}>
            Repeat {e.label}
          </option>
        ))}
      </select>
      {contractorName && (
        <select className={f.input} name="mode" defaultValue="same" style={{ maxWidth: 260 }}>
          <option value="same">Ask {contractorName} first</option>
          <option value="market">Get fresh prices each time</option>
        </select>
      )}
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending ? 'Setting…' : 'Set it up'}
      </button>
    </form>
  );
}

/** Flip an existing repeat between its contractor and the open market. */
export function SwitchRepeatMode({
  scheduleId,
  mode,
  contractorName,
}: {
  scheduleId: string;
  mode: 'same' | 'market';
  contractorName: string | null;
}) {
  const [state, action, pending] = useActionState(switchScheduleModeAction, EMPTY);

  if (state.ok) return <span className={f.hint}>{state.message}</span>;
  // Nobody to switch to: the job never had a contractor.
  if (mode === 'market' && !contractorName) return null;

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <input type="hidden" name="mode" value={mode === 'same' ? 'market' : 'same'} />
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending
          ? 'Changing…'
          : mode === 'same'
            ? 'Get fresh prices instead'
            : `Ask ${contractorName} first instead`}
      </button>
    </form>
  );
}

/** Stop a repeat. */
export function CancelRepeat({ scheduleId }: { scheduleId: string }) {
  const [state, action, pending] = useActionState(cancelScheduleAction, EMPTY);

  if (state.ok) return <span className={f.hint}>{state.message}</span>;

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending ? 'Stopping…' : 'Stop repeating'}
      </button>
    </form>
  );
}
