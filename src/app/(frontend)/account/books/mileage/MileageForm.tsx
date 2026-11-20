'use client';

import { startTransition, useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { postMileageAction } from '../actions';
import { milesFromOdometer } from '@/lib/books/mileage';

export function MileageForm({
  today,
  payAccounts,
  defaultPay,
}: {
  today: string;
  payAccounts: { code: string; name: string }[];
  defaultPay: string;
}) {
  const [state, action, pending] = useActionState(postMileageAction, emptyFormState);
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [typedMiles, setTypedMiles] = useState<string | null>(null);
  const fromReadings = milesFromOdometer(start, finish);
  // Miles follow the readings until the driver types their own figure (e.g. part of the trip was private).
  const miles = typedMiles ?? (fromReadings === null ? '' : String(fromReadings));
  return (
    <form
      className={s.form}
      // Submitted by hand rather than action= so React doesn't reset the
      // uncontrolled fields after a refused post while the readings stay.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Date</span>
          <input className={f.input} type="date" name="date" defaultValue={today} max={today} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Who drove</span>
          <input className={f.input} name="driver" maxLength={100} required />
        </label>
      </div>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>Odometer at start</span>
          <input
            className={f.input}
            name="odometer_start"
            inputMode="decimal"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="e.g. 45210"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Odometer at finish</span>
          <input
            className={f.input}
            name="odometer_finish"
            inputMode="decimal"
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            placeholder="e.g. 45262"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Business miles</span>
          <input
            className={f.input}
            name="miles"
            inputMode="decimal"
            value={miles}
            onChange={(e) => setTypedMiles(e.target.value === '' ? null : e.target.value)}
            required
          />
        </label>
      </div>
      <p className={f.hint}>
        {fromReadings !== null
          ? typedMiles !== null && typedMiles !== String(fromReadings)
            ? `The readings show ${fromReadings.toLocaleString('en-GB')} miles.`
            : `${fromReadings.toLocaleString('en-GB')} miles from the readings. Lower it if part of the trip was private.`
          : 'Give the odometer readings and we’ll work out the miles, or just type the miles in.'}
      </p>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Journey</span>
          <input className={f.input} name="journey" maxLength={200} placeholder="e.g. Romsey to Andover and back" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Purpose</span>
          <input className={f.input} name="purpose" maxLength={200} placeholder="e.g. quoting for paddock topping" />
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>Owed to the driver through</span>
        <select className={f.input} name="pay_code" defaultValue={defaultPay}>
          {payAccounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Posting…' : 'Claim mileage'}
        </button>
      </div>
    </form>
  );
}
