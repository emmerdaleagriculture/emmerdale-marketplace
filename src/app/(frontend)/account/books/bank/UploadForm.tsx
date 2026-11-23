'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { uploadStatementAction } from './actions';

/** Choose a CSV and the account it's for. */
export function UploadForm({ accounts, defaultCode }: { accounts: { code: string; name: string }[]; defaultCode: string }) {
  const [state, action, pending] = useActionState(uploadStatementAction, emptyFormState);
  return (
    <form action={action} className={s.form} style={{ maxWidth: 560 }}>
      <label className={f.field}>
        <span className={f.label}>Statement (CSV)</span>
        <input className={f.input} type="file" name="file" accept=".csv,text/csv,text/plain" required />
      </label>
      <label className={f.field}>
        <span className={f.label}>Which account is it for?</span>
        <select className={f.input} name="account_code" defaultValue={defaultCode}>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className={f.checkRow}>
        <input type="checkbox" name="flip" />
        <span>Money in and out are the wrong way round (some card statements show spending as a plus)</span>
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Reading and booking…' : 'Upload statement'}
        </button>
      </div>
    </form>
  );
}
