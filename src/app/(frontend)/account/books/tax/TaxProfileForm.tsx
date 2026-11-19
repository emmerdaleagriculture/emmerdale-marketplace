'use client';

import { useActionState, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { TAX_STRUCTURES, type TaxProfile, type TaxStructure } from '@/lib/books/taxPointers';
import { saveTaxProfileAction } from './actions';

/** How the person is taxed. Which fields show depends on the answer. */
export function TaxProfileForm({ profile, canEdit }: { profile: TaxProfile; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveTaxProfileAction, emptyFormState);
  const [structure, setStructure] = useState<TaxStructure>(profile.structure);
  const company = structure === 'limited_company';
  const partner = structure === 'partnership' || structure === 'llp';
  return (
    <form action={action} className={s.form}>
      <fieldset className={s.fieldset} disabled={!canEdit}>
        <legend>How you’re taxed</legend>
        <label className={f.field}>
          <span className={f.label}>The business is…</span>
          <select className={f.input} name="structure" value={structure} onChange={(e) => setStructure(e.target.value as TaxStructure)}>
            {(Object.keys(TAX_STRUCTURES) as TaxStructure[]).map((k) => (
              <option key={k} value={k}>
                {TAX_STRUCTURES[k]}
              </option>
            ))}
          </select>
          <span className={f.hint}>
            {company
              ? 'The company pays corporation tax on its profit; you pay tax on the salary and dividends you take.'
              : partner
                ? 'Each partner pays income tax and National Insurance on their own share of the profit.'
                : 'You pay income tax and Class 4 National Insurance on the profit, through Self Assessment.'}
          </span>
        </label>
        {!company && (
          <div className={s.row2}>
            <label className={f.field}>
              <span className={f.label}>Other income this tax year (£)</span>
              <input
                className={f.input}
                name="other_income"
                inputMode="decimal"
                defaultValue={profile.otherIncome ? String(profile.otherIncome / 100) : ''}
                placeholder="0"
              />
              <span className={f.hint}>A job, a pension, rent: before tax. It decides which band your profit falls in.</span>
            </label>
            {partner ? (
              <label className={f.field}>
                <span className={f.label}>Your share of the profit (%)</span>
                <input className={f.input} name="profit_share" type="number" min={1} max={100} defaultValue={profile.profitShare} />
              </label>
            ) : (
              <input type="hidden" name="profit_share" value="100" />
            )}
          </div>
        )}
        {!company && (
          <label className={f.checkRow}>
            <input type="checkbox" name="scottish" defaultChecked={profile.scottish} />
            <span>I live in Scotland (Scottish income tax rates)</span>
          </label>
        )}
        {company && (
          <label className={f.field}>
            <span className={f.label}>Associated companies</span>
            <input className={f.input} name="associated" type="number" min={0} max={50} defaultValue={profile.associated} style={{ maxWidth: 120 }} />
            <span className={f.hint}>Other companies you (or close family) control. Usually 0.</span>
          </label>
        )}
        {state.error && <p className={f.error}>{state.error}</p>}
        {state.ok && state.message && <p className={s.notice}>{state.message}</p>}
        {canEdit && (
          <div>
            <button className={f.btnPrimary} type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
