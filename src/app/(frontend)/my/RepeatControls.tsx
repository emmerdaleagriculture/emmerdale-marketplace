'use client';

import { useActionState } from 'react';
import { cancelScheduleAction, scheduleJobAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};

const EVERY = [
  { months: 3, label: 'every 3 months' },
  { months: 6, label: 'every 6 months' },
  { months: 12, label: 'once a year' },
];

/** Set a job to go out again on its own, every few months. */
export function RepeatSetup({ submissionId }: { submissionId: string }) {
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
      <button className={f.btnGhost} type="submit" disabled={pending}>
        {pending ? 'Setting…' : 'Set it up'}
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
