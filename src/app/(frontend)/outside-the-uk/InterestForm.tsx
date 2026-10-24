'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { registerInterestAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { EmailField } from '@/components/forms/EmailField';
import { INTEREST_COUNTRIES, OTHER_COUNTRY_CODE } from '@/lib/countries';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

/**
 * The waiting list for everywhere we are not yet. Side, country, where
 * exactly, what work, email. Short on purpose: the person has just been told
 * we can't help them today, and every extra field is a reason to close the
 * tab. `side` and `country` arrive preset from the link that brought them.
 */
export function InterestForm({
  side: initialSide,
  country: initialCountry,
  sourcePath,
}: {
  side: 'customer' | 'contractor';
  country: string | null;
  sourcePath: string;
}) {
  const [state, action, pending] = useActionState(registerInterestAction, emptyFormState);
  const [side, setSide] = useState<'customer' | 'contractor'>(initialSide);
  const [country, setCountry] = useState(initialCountry ?? '');
  const [formTs, setFormTs] = useState('');
  useEffect(() => setFormTs(String(Date.now())), []);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  const other = country === OTHER_COUNTRY_CODE;

  return (
    <form action={action} className={a.card}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <input type="hidden" name="form_ts" value={formTs} />
      <input type="hidden" name="source_path" value={sourcePath} />
      {/* Honeypot — real users never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className={a.sideFieldset}>
        <legend className={a.sideLegend}>I’m a…</legend>
        <div className={a.sideChoice}>
          {(
            [
              ['customer', 'Landowner with work to be done'],
              ['contractor', 'Contractor looking for work'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`${a.sideOption} ${side === value ? a.sideOptionOn : ''}`}>
              <input
                type="radio"
                name="side"
                value={value}
                checked={side === value}
                onChange={() => setSide(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={f.field}>
        <span className={f.label}>Country</span>
        <select
          className={f.input}
          name="country"
          required
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {INTEREST_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
          <option value={OTHER_COUNTRY_CODE}>Somewhere else</option>
        </select>
      </label>

      <label className={f.field}>
        <span className={f.label}>{other ? 'Which country, and where in it' : 'Where in the country'}</span>
        <input
          className={f.input}
          type="text"
          name="place"
          required={other}
          maxLength={120}
          placeholder={other ? 'Country, then region or nearest town' : 'Region, state, county or nearest town'}
        />
        <span className={f.hint}>So we know where to open first.</span>
      </label>

      <label className={f.field}>
        <span className={f.label}>
          {side === 'customer' ? 'What work do you need done?' : 'What work do you do?'}{' '}
          <span className={f.hint}>(optional)</span>
        </span>
        <textarea
          className={f.textarea}
          name="details"
          maxLength={600}
          placeholder={
            side === 'customer'
              ? 'Hedge cutting on a 10-acre paddock, fencing, topping…'
              : 'Topping, harrowing, fencing, hedge cutting, and how far you travel'
          }
        />
      </label>

      <EmailField name="email" required hint="One email when we open where you are. Nothing else." />

      <p className={f.hint} style={{ marginTop: 4 }}>
        We keep this to tell you when we open in your country, and for nothing else. See our{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Tell me when you open here'}
        </button>
      </div>
    </form>
  );
}
