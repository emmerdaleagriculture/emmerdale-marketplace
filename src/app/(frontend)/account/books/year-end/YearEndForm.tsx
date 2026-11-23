'use client';

import { useActionState, useMemo, useState } from 'react';
import { emptyFormState } from '@/lib/form';
import { formatPence, parsePounds, penceToDecimal } from '@/lib/books/money';
import { LABELS, type PenceField, type YearEndFigures } from '@/lib/books/yearEnd';
import f from '@/components/forms/forms.module.css';
import m from '../../market/market.module.css';
import s from '../books.module.css';
import { checkFiguresAction } from './actions';

type Group = { title: string; hint?: string; fields: { k: PenceField; hint?: string }[] };

const GROUPS: Group[] = [
  {
    title: 'Profit and loss for the year',
    fields: [
      { k: 'turnover', hint: 'Sales, before VAT' },
      { k: 'otherIncome', hint: 'Bank interest and other non-trading income' },
      { k: 'costOfSales', hint: 'Materials, subcontractors, hire, fuel for jobs (5xxx accounts)' },
      { k: 'staffCosts', hint: 'Wages, employer’s NI, pensions, directors’ salaries' },
      { k: 'depreciation', hint: 'Books doesn’t work this out: add it if your accountant does' },
      { k: 'otherExpenses', hint: 'Everything else you spent running the business' },
      { k: 'taxCharge', hint: 'Corporation tax for the year, for the accounts (the CT600 works out its own)' },
    ],
  },
  {
    title: 'Tax adjustments (CT600)',
    fields: [
      { k: 'capitalAllowances', hint: 'Equipment bought this year (Annual Investment Allowance). Cars and double-cab pickups don’t qualify; vans do.' },
      { k: 'disallowable', hint: 'Entertaining and other costs tax doesn’t allow' },
      { k: 'lossesBroughtForward', hint: 'Unused trading losses from earlier years, from your last CT600' },
    ],
  },
  {
    title: 'Balance sheet at the year end',
    fields: [
      { k: 'fixedAssets', hint: 'Machinery, vehicles and equipment, less depreciation' },
      { k: 'currentAssets', hint: 'Bank, money owed to you, VAT to reclaim' },
      { k: 'creditorsWithinYear', hint: 'Bills owed, VAT to pay, director’s loan, credit card' },
      { k: 'creditorsAfterYear', hint: 'Loans and finance due after more than a year' },
      { k: 'shareCapital', hint: 'Usually £1 to £100' },
    ],
  },
  {
    title: 'Last year (comparatives)',
    hint: 'From last year’s filed accounts. Books starts these from what it holds; check them against what you filed.',
    fields: [
      { k: 'priorTurnover' },
      { k: 'priorProfitBeforeTax', hint: 'A loss is negative' },
      { k: 'priorFixedAssets' },
      { k: 'priorCurrentAssets' },
      { k: 'priorCreditorsWithinYear' },
      { k: 'priorCreditorsAfterYear' },
      { k: 'priorShareCapital' },
    ],
  },
];

const toInput = (p: number) => (p === 0 ? '0' : penceToDecimal(p));

export function YearEndForm({
  periodEnd,
  figures,
  fromBooks,
  canEdit,
  canCheck,
  dlaOverdrawn,
  vehiclesBought = 0,
}: {
  periodEnd: string;
  figures: YearEndFigures;
  fromBooks: YearEndFigures;
  canEdit: boolean;
  /** TinyTax won't check a year that hasn't ended. */
  canCheck: boolean;
  dlaOverdrawn: boolean;
  /** Pence bought on 0050 Motor vehicles this year, not counted in capital allowances. */
  vehiclesBought?: number;
}) {
  const [state, check, checking] = useActionState(checkFiguresAction, emptyFormState);
  const [vals, setVals] = useState<Record<PenceField, string>>(
    () => Object.fromEntries(GROUPS.flatMap((g) => g.fields.map(({ k }) => [k, toInput(figures[k])]))) as Record<PenceField, string>,
  );
  const [hasLoan, setHasLoan] = useState(Boolean(figures.directorLoan) || dlaOverdrawn);
  const [firstYear, setFirstYear] = useState(figures.firstYear);
  const p = (k: PenceField) => parsePounds(vals[k]) ?? 0;

  const live = useMemo(() => {
    const profit = p('turnover') + p('otherIncome') - p('costOfSales') - p('staffCosts') - p('depreciation') - p('otherExpenses');
    const net = p('fixedAssets') + p('currentAssets') - p('creditorsWithinYear') - p('creditorsAfterYear');
    const priorNet = p('priorFixedAssets') + p('priorCurrentAssets') - p('priorCreditorsWithinYear') - p('priorCreditorsAfterYear');
    return { profit, net, reserve: net - p('shareCapital'), priorReserve: priorNet - p('priorShareCapital') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals]);

  const dl = figures.directorLoan ?? fromBooks.directorLoan;

  return (
    <form action={check} className={s.fieldset} style={{ display: 'grid', gap: 16 }}>
      <input type="hidden" name="period_end" value={periodEnd} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="firstYear" checked={firstYear} onChange={(e) => setFirstYear(e.target.checked)} disabled={!canEdit} />
        <span>This is the company’s first accounting period (no figures for last year)</span>
      </label>
      {GROUPS.filter((g) => !(firstYear && g.title.startsWith('Last year'))).map((g) => (
        <div key={g.title} className={m.tableWrap}>
          {g.hint && <p className={s.muted} style={{ margin: '0 0 6px' }}>{g.hint}</p>}
          <table className={m.table}>
            <thead>
              <tr>
                <th>{g.title}</th>
                <th className={m.num}>Books say</th>
                <th className={m.num}>File as (£)</th>
              </tr>
            </thead>
            <tbody>
              {g.fields.map(({ k, hint }) => {
                const changed = (parsePounds(vals[k]) ?? NaN) !== fromBooks[k];
                return (
                  <tr key={k}>
                    <td>
                      <label htmlFor={`ye-${k}`}>
                        <b>{LABELS[k]}</b>
                      </label>
                      {hint && <div className={s.muted} style={{ fontSize: 13 }}>{hint}</div>}
                      {k === 'capitalAllowances' && vehiclesBought > 0 && (
                        <div className={s.muted} style={{ fontSize: 13 }}>
                          Not counted: {formatPence(vehiclesBought)} of vehicles bought this year. Add any vans; cars and double-cab pickups don’t qualify.
                        </div>
                      )}
                    </td>
                    <td className={m.num}>{formatPence(fromBooks[k])}</td>
                    <td className={m.num}>
                      <input
                        id={`ye-${k}`}
                        className={f.input}
                        name={k}
                        inputMode="decimal"
                        value={vals[k]}
                        onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                        disabled={!canEdit}
                        style={{ textAlign: 'right', minWidth: 110, fontWeight: changed ? 700 : undefined }}
                        aria-describedby={changed ? `ye-${k}-changed` : undefined}
                      />
                      {changed && (
                        <span id={`ye-${k}-changed`} className={s.muted} style={{ fontSize: 12 }}>
                          changed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {g.title.startsWith('Profit') && (
                <tr className={s.totalRow}>
                  <td colSpan={2}>{live.profit >= 0 ? 'Profit' : 'Loss'} before tax</td>
                  <td className={m.num}>{formatPence(live.profit)}</td>
                </tr>
              )}
              {g.title.startsWith('Last year') && (
                <tr>
                  <td colSpan={2}>Profit and loss reserve last year</td>
                  <td className={m.num}>{formatPence(live.priorReserve)}</td>
                </tr>
              )}
              {g.title.startsWith('Balance') && (
                <>
                  <tr className={s.totalRow}>
                    <td colSpan={2}>Net assets</td>
                    <td className={m.num}>{formatPence(live.net)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      Profit and loss reserve
                      <div className={s.muted} style={{ fontSize: 13 }}>
                        Net assets less share capital, so the balance sheet always balances
                      </div>
                    </td>
                    <td className={m.num}>{formatPence(live.reserve)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label className={f.field}>
          <span className={f.label}>Director signing</span>
          <input className={f.input} name="declarantName" defaultValue={figures.declarantName} maxLength={120} required disabled={!canEdit} />
        </label>
        <label className={f.field}>
          <span className={f.label}>Average employees</span>
          <input className={f.input} name="averageEmployees" inputMode="numeric" defaultValue={figures.averageEmployees} disabled={!canEdit} />
          <span className={f.hint}>Count directors too.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Associated companies</span>
          <input className={f.input} name="associatedCompanies" inputMode="numeric" defaultValue={figures.associatedCompanies} disabled={!canEdit} />
          <span className={f.hint}>Other companies under the same control. Usually 0.</span>
        </label>
      </div>

      <fieldset className={s.fieldset}>
        <legend>Director’s loan</legend>
        {dlaOverdrawn && (
          <p className={f.error} style={{ marginTop: 0 }}>
            Your books show the director owing the company money at the year end. The accounts must say so, and the CT600 may owe
            extra tax (s455) unless it’s repaid within nine months.
          </p>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="has_loan" checked={hasLoan} onChange={(e) => setHasLoan(e.target.checked)} disabled={!canEdit} />
          <span>A director borrowed from the company this year and still owed it at the year end</span>
        </label>
        {hasLoan && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 12 }}>
            <label className={f.field}>
              <span className={f.label}>Director’s full name</span>
              <input className={f.input} name="dl_name" defaultValue={dl?.name ?? figures.declarantName} maxLength={56} disabled={!canEdit} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Owed at the start of the year (£)</span>
              <input className={f.input} name="dl_bf" inputMode="decimal" defaultValue={toInput(dl?.broughtForward ?? 0)} disabled={!canEdit} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Lent this year (£)</span>
              <input className={f.input} name="dl_lent" inputMode="decimal" defaultValue={toInput(dl?.lent ?? 0)} disabled={!canEdit} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Of that, repaid before the year end (£)</span>
              <input className={f.input} name="dl_repaid_in" inputMode="decimal" defaultValue={toInput(dl?.repaidInYear ?? 0)} disabled={!canEdit} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Repaid within 9 months after (£)</span>
              <input className={f.input} name="dl_repaid_after" inputMode="decimal" defaultValue={toInput(dl?.repaidAfter ?? 0)} disabled={!canEdit} />
            </label>
            <label className={f.field}>
              <span className={f.label}>Date repaid</span>
              <input className={f.input} name="dl_repaid_date" type="date" defaultValue={dl?.repaidDate ?? ''} disabled={!canEdit} />
            </label>
          </div>
        )}
      </fieldset>

      {state.error && <p className={f.error}>{state.error}</p>}
      {state.message && <p className={f.hint}>{state.message}</p>}
      {canEdit && (
        <div>
          <button type="submit" className={f.btnPrimary} disabled={checking}>
            {checking ? (canCheck ? 'Checking with TinyTax…' : 'Saving…') : canCheck ? 'Save and check with TinyTax' : 'Save'}
          </button>
          <p className={f.hint}>
            {canCheck
              ? 'A check sends nothing to HMRC or Companies House. TinyTax validates the figures and works out the tax.'
              : 'TinyTax checks a year once it has ended. You can save your changes until then.'}
          </p>
        </div>
      )}
    </form>
  );
}
