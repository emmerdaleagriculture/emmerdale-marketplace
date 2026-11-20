'use client';

import { useActionState, useState } from 'react';
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
  const [miles, setMiles] = useState('');
  // Fill business miles from the readings; the driver can still lower it if part of the trip was private.
  const onReading = (nextStart: string, nextFinish: string) => {
    setStart(nextStart);
    setFinish(nextFinish);
    const d = milesFromOdometer(nextStart, nextFinish);
    if (d !== null) setMiles(String(d));
  };
  const fromReadings = milesFromOdometer(start, finish);
  return (
    <form action={action} className={s.form}>
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
            onChange={(e) => onReading(e.target.value, finish)}
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
            onChange={(e) => onReading(start, e.target.value)}
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
            onChange={(e) => setMiles(e.target.value)}
            required
          />
        </label>
      </div>
      <p className={f.hint}>
        {fromReadings !== null
          ? `${fromReadings.toLocaleString('en-GB')} miles from the readings. Lower it if part of the trip was private.`
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
