'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { formatPence } from '@/lib/books/money';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { importCustomersAction, postOpeningBalancesAction, readTrialBalanceAction, type TbPreviewState, type TbRow } from './actions';

type Ours = { code: string; name: string; type: string };
const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function SourcePicker() {
  return (
    <label className={f.field}>
      <span className={f.label}>Exported from</span>
      <select className={f.input} name="source" defaultValue="xero">
        <option value="xero">Xero</option>
        <option value="freshbooks">FreshBooks</option>
        <option value="other">Something else</option>
      </select>
    </label>
  );
}

/** Opening balances: upload a trial balance, check the matches, post. */
export function TrialBalanceImport({ accounts }: { accounts: Ours[] }) {
  const [state, read, reading] = useActionState<TbPreviewState, FormData>(readTrialBalanceAction, emptyFormState);
  const p = state.preview;
  return (
    <>
      <form action={read} className={s.form} style={{ maxWidth: 560 }}>
        <SourcePicker />
        <label className={f.field}>
          <span className={f.label}>Trial balance (Excel or CSV)</span>
          <input className={f.input} type="file" name="file" accept={ACCEPT} required />
        </label>
        {state.error && <p className={f.error}>{state.error}</p>}
        <div>
          <button className={f.btnGhost} type="submit" disabled={reading}>
            {reading ? 'Reading…' : p ? 'Read a different file' : 'Read the file'}
          </button>
        </div>
      </form>
      {p && <Review key={`${p.file}:${p.rows.length}:${p.debits}`} preview={p} accounts={accounts} />}
    </>
  );
}

function Review({ preview, accounts }: { preview: NonNullable<TbPreviewState['preview']>; accounts: Ours[] }) {
  const [rows, setRows] = useState<TbRow[]>(preview.rows);
  const [date, setDate] = useState(preview.asAt ?? '');
  const [state, post, posting] = useActionState(postOpeningBalancesAction, emptyFormState);
  const out = preview.debits - preview.credits;
  const newCount = rows.filter((r) => r.target.startsWith('new:')).length;
  return (
    <form action={post} className={s.form}>
      <h3 className={m.h2}>Check the matches</h3>
      <p className={m.sub}>
        {rows.length} accounts with a balance in <b>{preview.file}</b>. Each one is matched to an account in your books;
        change any that look wrong. “New account” adds one with their name.
      </p>
      {out !== 0 && (
        <p className={f.error}>
          The debits and credits in the file are {formatPence(Math.abs(out))} apart, so these can’t be posted. Make sure
          you exported the whole Trial Balance report.
        </p>
      )}
      <div className={m.tableWrap}>
        <table className={m.table}>
          <thead>
            <tr>
              <th>Their account</th>
              <th className={m.num}>Debit</th>
              <th className={m.num}>Credit</th>
              <th>Goes to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'normal' }}>
                  {r.name}
                  {r.code && <span className={s.muted}> ({r.code})</span>}
                </td>
                <td className={m.num}>{r.balance > 0 ? formatPence(r.balance) : ''}</td>
                <td className={m.num}>{r.balance < 0 ? formatPence(-r.balance) : ''}</td>
                <td>
                  <select
                    className={f.input}
                    aria-label={`Account for ${r.name}`}
                    value={r.target}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                  >
                    <optgroup label="New account">
                      {TYPES.map((t) => (
                        <option key={t} value={`new:${t}`}>
                          New {t} account: {r.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Your accounts">
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </td>
              </tr>
            ))}
            <tr className={s.totalRow}>
              <td>Total</td>
              <td className={m.num}>{formatPence(preview.debits)}</td>
              <td className={m.num}>{formatPence(preview.credits)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <label className={f.field} style={{ maxWidth: 320 }}>
        <span className={f.label}>Balances as at</span>
        <input className={f.input} type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {!preview.asAt && <p className={m.fine}>The date wasn’t in the file: use the date you ran the report for.</p>}
      {preview.earlier > 0 && date === preview.asAt && (
        <p className={s.notice}>
          Your books already have {preview.earlier} entr{preview.earlier === 1 ? 'y' : 'ies'} on or before this date. Those are
          counted in the trial balance you’re importing too, so they’d be in twice. Void them on the journal page first, or
          import a trial balance from an earlier date.
        </p>
      )}
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />
      <input type="hidden" name="source" value={preview.source} />
      <input type="hidden" name="file" value={preview.file} />
      {state.error && <p className={f.error}>{state.error}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={posting || out !== 0 || !date}>
          {posting ? 'Posting…' : `Post opening balances${newCount ? ` and add ${newCount} account${newCount === 1 ? '' : 's'}` : ''}`}
        </button>
      </div>
    </form>
  );
}

/** Customers from a contacts / clients export. */
export function CustomersImport() {
  const [state, action, pending] = useActionState(importCustomersAction, emptyFormState);
  return (
    <form action={action} className={s.form} style={{ maxWidth: 560 }}>
      <SourcePicker />
      <label className={f.field}>
        <span className={f.label}>Contacts or clients (CSV or Excel)</span>
        <input className={f.input} type="file" name="file" accept={ACCEPT} required />
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.message && <p className={s.notice}>{state.message}</p>}
      <div>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add customers'}
        </button>
      </div>
    </form>
  );
}
