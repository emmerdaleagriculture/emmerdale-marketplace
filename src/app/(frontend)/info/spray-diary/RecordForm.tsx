'use client';

import { useActionState, useEffect, useRef } from 'react';
import { emptyFormState } from '@/lib/form';
import { DOSE_UNITS, WIND_DIRECTIONS, type SprayRecord } from '@/lib/info/sprayRecords';
import { saveSprayRecordAction } from './actions';
import c from '../calc.module.css';
import css from './sprayDiary.module.css';

/**
 * One product applied to one field. `start` prefills it: the operator's own
 * details from their last record, or a whole record being copied (a second
 * product in the same tank, the same job next month).
 */
export function RecordForm({ start, today }: { start: Partial<SprayRecord>; today: string }) {
  const [state, action, pending] = useActionState(saveSprayRecordAction, emptyFormState);
  const form = useRef<HTMLFormElement>(null);
  const said = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.ok || state.error) said.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state]);

  const t = (k: keyof SprayRecord) => (start[k] === null || start[k] === undefined ? '' : String(start[k]));

  return (
    <form ref={form} action={action} className={c.calc} id="add">
      <h2 className={c.calcTitle}>Add a record</h2>
      <p className={c.calcLede}>One record for each product you applied. Starred boxes are the ones the law asks for.</p>

      <h3 className={css.part}>When and where</h3>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Date *</span>
          <span className={c.inputRow}>
            <input type="date" name="sprayed_on" defaultValue={today} max={today} required />
          </span>
        </label>
        <label className={c.field}>
          <span>Started</span>
          <span className={c.inputRow}>
            <input type="time" name="start_time" defaultValue={t('start_time').slice(0, 5)} />
          </span>
        </label>
        <label className={c.field}>
          <span>Finished</span>
          <span className={c.inputRow}>
            <input type="time" name="end_time" defaultValue={t('end_time').slice(0, 5)} />
          </span>
        </label>
        <label className={c.field}>
          <span>Field or site *</span>
          <span className={c.inputRow}>
            <input name="site" defaultValue={t('site')} maxLength={200} required placeholder="Top paddock, Manor Farm" />
          </span>
        </label>
        <label className={c.field}>
          <span>Postcode</span>
          <span className={c.inputRow}>
            <input name="postcode" defaultValue={t('postcode')} maxLength={10} autoCapitalize="characters" />
          </span>
        </label>
        <label className={c.field}>
          <span>Customer</span>
          <span className={c.inputRow}>
            <input name="customer" defaultValue={t('customer')} maxLength={200} />
          </span>
        </label>
        <label className={c.field}>
          <span>What was sprayed *</span>
          <span className={c.inputRow}>
            <input name="situation" defaultValue={t('situation')} maxLength={200} required placeholder="Grazing paddock" />
          </span>
        </label>
        <label className={c.field}>
          <span>Area sprayed *</span>
          <span className={c.inputRow}>
            <input name="area" inputMode="decimal" defaultValue={t('area_ha')} required />
            <select name="area_unit" aria-label="Area unit" defaultValue={start.area_ha ? 'ha' : 'acre'}>
              <option value="acre">acres</option>
              <option value="ha">ha</option>
            </select>
          </span>
        </label>
      </div>

      <h3 className={css.part}>What went on</h3>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Product *</span>
          <span className={c.inputRow}>
            <input name="product" defaultValue={t('product')} maxLength={200} required />
          </span>
        </label>
        <label className={c.field}>
          <span>MAPP number</span>
          <span className={c.inputRow}>
            <input name="mapp" inputMode="numeric" defaultValue={t('mapp')} maxLength={6} placeholder="From the label" />
          </span>
        </label>
        <label className={c.field}>
          <span>Dose *</span>
          <span className={c.inputRow}>
            <input name="dose" inputMode="decimal" defaultValue={t('dose')} required />
            <select name="dose_unit" aria-label="Dose unit" defaultValue={start.dose_unit ?? 'L/ha'}>
              {DOSE_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Water volume</span>
          <span className={c.inputRow}>
            <input name="water_l_ha" inputMode="decimal" defaultValue={t('water_l_ha')} />
            <span className={c.unit}>L/ha</span>
          </span>
        </label>
        <label className={c.field}>
          <span>Weed or reason</span>
          <span className={c.inputRow}>
            <input name="target" defaultValue={t('target')} maxLength={300} placeholder="Docks and thistles" />
          </span>
        </label>
      </div>

      <h3 className={css.part}>Conditions</h3>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Wind</span>
          <span className={c.inputRow}>
            <input name="wind_mph" inputMode="decimal" />
            <span className={c.unit}>mph</span>
            <select name="wind_direction" aria-label="Wind from" defaultValue="">
              <option value="">from</option>
              {WIND_DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </span>
        </label>
        <label className={c.field}>
          <span>Temperature</span>
          <span className={c.inputRow}>
            <input name="temp_c" inputMode="decimal" />
            <span className={c.unit}>°C</span>
          </span>
        </label>
        <label className={c.field}>
          <span>Sky and ground</span>
          <span className={c.inputRow}>
            <input name="conditions" maxLength={300} placeholder="Overcast, dry leaf" />
          </span>
        </label>
      </div>

      <h3 className={css.part}>Who and with what</h3>
      <div className={c.fields}>
        <label className={c.field}>
          <span>Operator *</span>
          <span className={c.inputRow}>
            <input name="operator" defaultValue={t('operator')} maxLength={200} required autoComplete="name" />
          </span>
        </label>
        <label className={c.field}>
          <span>Certificate</span>
          <span className={c.inputRow}>
            <input name="certificate" defaultValue={t('certificate')} maxLength={100} placeholder="PA1, PA2, number" />
          </span>
        </label>
        <label className={c.field}>
          <span>Sprayer and nozzles</span>
          <span className={c.inputRow}>
            <input name="equipment" defaultValue={t('equipment')} maxLength={200} />
          </span>
        </label>
        <label className={c.field}>
          <span>Stock out until</span>
          <span className={c.inputRow}>
            <input type="date" name="stock_out_until" min={today} />
          </span>
        </label>
      </div>
      <label className={`${c.field} ${css.notes}`}>
        <span>Notes</span>
        <textarea name="notes" maxLength={2000} rows={2} defaultValue={t('notes')} placeholder="Buffer zones kept, neighbours told, anything unusual" />
      </label>

      <div className={css.submitRow} data-thumb>
        <button type="submit" className={css.save} disabled={pending}>
          {pending ? 'Saving…' : 'Save record'}
        </button>
      </div>
      <p ref={said} className={state.error ? css.error : css.ok} role={state.error ? 'alert' : 'status'}>
        {state.error ?? (state.ok ? state.message : '')}
      </p>
    </form>
  );
}
