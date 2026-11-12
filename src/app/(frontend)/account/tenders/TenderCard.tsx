'use client';

import { useActionState } from 'react';
import { saveTenderAction, type TenderSaveState } from './actions';
import { FIT_LABEL, KIND_LABEL, STATUS_LABEL, TENDER_STATUSES, valueRange } from '@/lib/tenders/labels';
import s from './tenders.module.css';

export type TenderRow = {
  id: string;
  kind: string;
  fit: string;
  title: string;
  buyer: string;
  description: string;
  url: string;
  deadline: string | null;
  contract_start: string | null;
  contract_end: string | null;
  action_by: string | null;
  value_low: number | null;
  value_high: number | null;
  incumbent: string | null;
  postcode: string | null;
  county: string | null;
  distance_miles: number | null;
  status: string | null;
  notes: string | null;
  is_new: boolean;
};

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
    : null;

function daysLeft(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (d < 0) return 'passed';
  if (d === 0) return 'today';
  return d === 1 ? '1 day left' : `${d} days left`;
}

/** One tender: what it is, where, when to act, and the member's own status and notes. */
export function TenderCard({ t }: { t: TenderRow }) {
  const [state, action, pending] = useActionState<TenderSaveState, FormData>(saveTenderAction, {});
  const renewal = t.kind === 'renewal';
  const value = valueRange(t.value_low, t.value_high);
  const place = [t.county, t.postcode, t.distance_miles != null ? `${t.distance_miles} miles from your base` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={t.is_new ? `${s.card} ${s.cardNew}` : s.card}>
      <div className={s.tags}>
        {t.is_new && <span className={`${s.tag} ${s.tagNew}`}>New</span>}
        <span className={renewal ? `${s.tag} ${s.tagRenewal}` : s.tag}>{KIND_LABEL[t.kind] ?? t.kind}</span>
        <span className={`${s.tag} ${s.tagFit}`}>{FIT_LABEL[t.fit] ?? t.fit}</span>
      </div>
      <h3 className={s.title}>
        <a href={t.url} target="_blank" rel="noopener noreferrer">
          {t.title}
        </a>
      </h3>
      <p className={s.buyer}>{t.buyer}</p>
      {place && <p className={s.place}>{place}</p>}

      <dl className={s.facts}>
        {renewal ? (
          <>
            <div>
              <dt>Approach the buyer by</dt>
              <dd>{day(t.action_by) ?? '—'}</dd>
            </div>
            <div>
              <dt>Contract ends</dt>
              <dd>{day(t.contract_end) ?? '—'}</dd>
            </div>
            {t.incumbent && (
              <div>
                <dt>Held by</dt>
                <dd>{t.incumbent}</dd>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <dt>{t.kind === 'pipeline' ? 'Expected by' : 'Deadline'}</dt>
              <dd>
                {day(t.deadline) ?? 'Not given'}
                {t.deadline && <span className={s.muted}> · {daysLeft(t.deadline)}</span>}
              </dd>
            </div>
            {t.contract_start && (
              <div>
                <dt>Starts</dt>
                <dd>{day(t.contract_start)}</dd>
              </div>
            )}
          </>
        )}
        {value && (
          <div>
            <dt>Value</dt>
            <dd>{value}</dd>
          </div>
        )}
      </dl>

      {t.description && (
        <details className={s.desc}>
          <summary>What the notice says</summary>
          <p>{t.description}</p>
        </details>
      )}

      <form action={action} className={s.form}>
        <input type="hidden" name="tender_id" value={t.id} />
        <label className={s.field}>
          <span>Your status</span>
          <select name="status" defaultValue={t.status ?? ''}>
            <option value="">—</option>
            {TENDER_STATUSES.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={`${s.field} ${s.fieldWide}`}>
          <span>Notes (only you see these)</span>
          <textarea name="notes" rows={2} maxLength={2000} defaultValue={t.notes ?? ''} />
        </label>
        <div className={s.formFoot}>
          <button type="submit" className={s.save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          {state.ok && !pending && <span className={s.saved}>Saved</span>}
          {state.error && <span className={s.error}>{state.error}</span>}
          <a href={t.url} target="_blank" rel="noopener noreferrer" className={s.notice}>
            Open the notice ↗
          </a>
        </div>
      </form>
    </article>
  );
}
