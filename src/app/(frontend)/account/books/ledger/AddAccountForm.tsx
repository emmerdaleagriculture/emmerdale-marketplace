'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { addAccountAction } from '../actions';

export function AddAccountForm() {
  const [state, action, pending] = useActionState(addAccountAction, emptyFormState);
  return (
    <form action={action} className={s.form}>
      <div className={s.row3}>
        <label className={f.field}>
          <span className={f.label}>Code</span>
          <input className={f.input} name="code" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
        </label>
        <label className={f.field} style={{ gridColumn: 'span 2' }}>
          <span className={f.label}>Name</span>
          <input className={f.input} name="name" maxLength={120} required />
        </label>
      </div>
      <div className={s.row2}>
        <label className={f.field}>
          <span className={f.label}>Type</span>
          <select className={f.input} name="type" defaultValue="expense">
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Description</span>
          <input className={f.input} name="description" maxLength={300} />
        </label>
      </div>
      <label className={f.checkRow}>
        <input type="checkbox" name="is_fixed_asset" />
        <span>Fixed asset (equipment or vehicles that last more than a year)</span>
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.ok && state.message && <p className={f.success}>{state.message}</p>}
      <div>
        <button className={f.btnGhost} type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
