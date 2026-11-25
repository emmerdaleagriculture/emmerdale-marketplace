'use client';

import { startTransition, useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { postMileageAction, startMileageTripAction } from '../actions';
import { milesFromOdometer, parseOdometer, type OpenTrip } from '@/lib/books/mileage';

export function MileageForm({
  today,
  payAccounts,
  defaultPay,
  trip,
}: {
  today: string;
  payAccounts: { code: string; name: string }[];
  defaultPay: string;
  /** A trip started earlier, back for its finish reading. */
  trip: OpenTrip | null;
}) {
  const [state, action, pending] = useActionState(postMileageAction, emptyFormState);
  // Setting off: only the start reading is known, so it is saved until the driver is back.
  const [startState, startAction, starting] = useActionState(startMileageTripAction, emptyFormState);
  const [last, setLast] = useState<'claim' | 'start'>('claim');
  const [start, setStart] = useState(trip ? String(trip.odometerStart) : '');
  const [finish, setFinish] = useState('');
  const [typedMiles, setTypedMiles] = useState<string | null>(null);
  const fromReadings = milesFromOdometer(start, finish);
  // Miles follow the readings until the driver types their own figure (e.g. part of the trip was private).
  const miles = typedMiles ?? (fromReadings === null ? '' : String(fromReadings));
  const waitingForFinish = parseOdometer(start) !== null && finish.trim() === '' && typedMiles === null;
  const busy = pending || starting;
  const error = last === 'start' ? startState.error : state.error;
  return (
    <form
      className={s.form}
      // Submitted by hand rather than action= so React doesn't reset the
      // uncontrolled fields after a refused post while the readings stay.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const saveStart = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-intent') === 'start';
        setLast(saveStart ? 'start' : 'claim');
        startTransition(() => (saveStart ? startAction(fd) : action(fd)));
      }}
    >
      {trip && <input type="hidden" name="trip_id" value={trip.id} />}
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Date</span>
          <input className={f.input} type="date" name="date" defaultValue={trip?.date ?? today} max={today} required />
        </label>
        <label className={f.field}>
          <span className={f.label}>Who drove</span>
          <input className={f.input} name="driver" maxLength={100} defaultValue={trip?.driver ?? ''} required />
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
          : waitingForFinish
            ? 'Setting off? Save the start reading now and add the finish reading when you’re back.'
            : 'Give the odometer readings and we’ll work out the miles, or just type the miles in.'}
      </p>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Journey</span>
          <input className={f.input} name="journey" maxLength={200} defaultValue={trip?.journey ?? ''} placeholder="e.g. Romsey to Andover and back" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Purpose</span>
          <input className={f.input} name="purpose" maxLength={200} defaultValue={trip?.purpose ?? ''} placeholder="e.g. quoting for paddock topping" />
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
      {error && <p className={f.error}>{error}</p>}
      <div className={s.formButtons}>
        <button className={f.btnPrimary} type="submit" disabled={busy}>
          {pending ? 'Posting…' : 'Claim mileage'}
        </button>
        {/* No finish reading yet: keep the start. formNoValidate, as the miles aren't known either. */}
        {(waitingForFinish || starting) && (
          <button className={f.btnGhost} type="submit" data-intent="start" formNoValidate disabled={busy}>
            {starting ? 'Saving…' : trip ? 'Save for later' : 'Save start reading'}
          </button>
        )}
      </div>
    </form>
  );
}
