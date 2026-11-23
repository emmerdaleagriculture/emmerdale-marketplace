'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { addRuleAction } from './actions';

type Acc = { code: string; name: string; group: string };

const VATS: [string, string][] = [
  ['', 'As usual'],
  ['STD', '20%'],
  ['RED', '5%'],
  ['ZERO', '0%'],
  ['EXEMPT', 'Exempt'],
  ['OUTSIDE', 'No VAT (outside the scope)'],
];

/** One rule: match text → account, VAT, what pays it. */
export function RuleForm({ accounts, payers, defaultMatch }: { accounts: Acc[]; payers: Acc[]; defaultMatch: string }) {
  const [state, action, pending] = useActionState(addRuleAction, emptyFormState);
  const groups = [...new Set(accounts.map((a) => a.group))];
  return (
    <form action={action} className={s.form} style={{ maxWidth: 560 }} key={state.message ?? 'new'}>
      <label className={f.field}>
        <span className={f.label}>When the payee or supplier contains</span>
        <input className={f.input} name="match_text" defaultValue={defaultMatch} placeholder="e.g. Lakeside Oils" required maxLength={100} />
      </label>
      <label className={f.field}>
        <span className={f.label}>For</span>
        <select className={f.input} name="direction" defaultValue="any">
          <option value="any">Money in or out</option>
          <option value="out">Money out only</option>
          <option value="in">Money in only</option>
        </select>
      </label>
      <label className={f.field}>
        <span className={f.label}>It goes to</span>
        <select className={f.input} name="account_code" defaultValue="">
          <option value="">(no change)</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {accounts
                .filter((a) => a.group === g)
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} {a.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={f.field}>
        <span className={f.label}>VAT (bank rows; receipts keep the VAT shown on them)</span>
        <select className={f.input} name="vat_code" defaultValue="">
          {VATS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className={f.field}>
        <span className={f.label}>Paid by</span>
        <select className={f.input} name="paid_from" defaultValue="">
          <option value="">Whatever the receipt shows</option>
          {payers.map((a) => (
            <option key={a.code} value={a.code}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.message && <p className={s.notice}>{state.message}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </form>
  );
}
