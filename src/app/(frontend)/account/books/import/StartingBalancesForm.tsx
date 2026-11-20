'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { formatPence, parsePounds } from '@/lib/books/money';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { postStartingBalancesAction } from './actions';

type Acc = { code: string; name: string; type: 'asset' | 'liability'; is_fixed_asset: boolean };

/** What a positive figure means for each kind of account, in plain words. */
function hint(a: Acc): string {
  if (a.code === '1100') return 'Owed to you by customers';
  if (a.code === '2100') return 'Bills you haven’t paid yet';
  if (a.code === '2201') return 'VAT owed to HMRC (a minus if HMRC owes you)';
  if (a.code === '2300') return 'Owed to the director (a minus if the director owes the company)';
  if (a.is_fixed_asset) return 'What it’s worth now';
  if (a.code >= '1200' && a.code < '1300') return a.type === 'liability' ? 'Owed on it' : 'In the account (a minus if overdrawn)';
  return a.type === 'liability' ? 'Owed' : 'Held or owed to you';
}

/**
 * Starting balances by hand, for someone not coming from another app: a
 * figure per balance-sheet account, optionally the year so far, and the
 * difference shown as it's typed (it goes to the owner's equity).
 */
export function StartingBalancesForm({
  accounts,
  defaultDate,
  equityName,
}: {
  accounts: Acc[];
  defaultDate: string;
  equityName: string;
}) {
  const [state, action, pending] = useActionState(postStartingBalancesAction, emptyFormState);
  const [vals, setVals] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setVals({ ...vals, [k]: v });
  const p = (k: string) => parsePounds(vals[k] ?? '') ?? 0;
  const assets = accounts.filter((a) => a.type === 'asset').reduce((t, a) => t + p(`bal_${a.code}`), 0);
  const owed = accounts.filter((a) => a.type === 'liability').reduce((t, a) => t + p(`bal_${a.code}`), 0);
  const profit = Math.max(p('sales_so_far'), 0) - Math.max(p('costs_so_far'), 0);
  const equity = assets - owed - profit;
  const any = Object.values(vals).some((v) => v.trim());
  const groups: [string, Acc[]][] = [
    ['Bank and cards', accounts.filter((a) => a.code >= '1200' && a.code < '1300')],
    ['Owed to you and by you', accounts.filter((a) => !(a.code >= '1200' && a.code < '1300') && !a.is_fixed_asset)],
    ['Machinery, vehicles and equipment', accounts.filter((a) => a.is_fixed_asset)],
  ];
  const field = (name: string, label: string, sub: string) => (
    <label className={f.field} key={name}>
      <span className={f.label}>{label}</span>
      <input
        className={f.input}
        name={name}
        inputMode="decimal"
        placeholder="0.00"
        value={vals[name] ?? ''}
        onChange={(e) => set(name, e.target.value)}
        aria-describedby={`${name}-hint`}
      />
      <span className={m.fine} id={`${name}-hint`}>
        {sub}
      </span>
    </label>
  );

  return (
    <form action={action} className={s.form} style={{ maxWidth: 560 }}>
      <label className={f.field} style={{ maxWidth: 320 }}>
        <span className={f.label}>Balances as at</span>
        <input className={f.input} type="date" name="date" defaultValue={defaultDate} required />
      </label>
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <fieldset className={s.fieldset} key={title}>
            <legend>{title}</legend>
            {list.map((a) => field(`bal_${a.code}`, `${a.code} ${a.name}`, hint(a)))}
          </fieldset>
        ))}
      <fieldset className={s.fieldset}>
        <legend>Starting part-way through your year? (optional)</legend>
        {field('sales_so_far', 'Sales so far this year', 'Goes to 4000 Sales')}
        {field('costs_so_far', 'Costs so far this year', 'Goes to 6990 General expenses; split it later if you like')}
      </fieldset>
      {any && (
        <p className={s.notice}>
          The difference, {formatPence(Math.abs(equity))}
          {equity < 0 ? ' (a minus)' : ''}, goes to <b>{equityName}</b> so it all balances.
        </p>
      )}
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending || !any}>
          {pending ? 'Posting…' : 'Post starting balances'}
        </button>
      </div>
    </form>
  );
}
