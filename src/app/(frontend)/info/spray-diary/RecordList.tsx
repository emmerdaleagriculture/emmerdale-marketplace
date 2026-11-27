'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ACRES_PER_HA, fig } from '@/lib/info/sprayMaths';
import { productUsed, type SprayRecord } from '@/lib/info/sprayRecords';
import { deleteSprayRecordAction } from './actions';
import css from './sprayDiary.module.css';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

export function RecordList({ records, today }: { records: SprayRecord[]; today: string }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <ul className={css.list}>
      {records.map((r) => {
        const used = productUsed(r);
        const weather = [
          r.wind_mph !== null ? `wind ${fig(r.wind_mph)} mph${r.wind_direction ? ` from ${r.wind_direction}` : ''}` : null,
          r.temp_c !== null ? `${fig(r.temp_c)}°C` : null,
          r.conditions,
        ].filter(Boolean);
        return (
          <li key={r.id} className={css.record}>
            <div className={css.recordHead}>
              <span className={css.recordDay}>
                {day(r.sprayed_on)}
                {r.start_time && `, ${r.start_time.slice(0, 5)}`}
                {r.end_time && ` to ${r.end_time.slice(0, 5)}`}
              </span>
              {r.stock_out_until && r.stock_out_until >= today && <span className={css.stock}>Stock out until {day(r.stock_out_until)}</span>}
            </div>
            <div className={css.recordProduct}>
              {r.product}
              {r.mapp && <span className={css.mapp}> MAPP {r.mapp}</span>}
            </div>
            <div className={css.recordLine}>
              {fig(r.dose)} {r.dose_unit}
              {r.water_l_ha !== null && ` in ${fig(r.water_l_ha)} L/ha of water`} on {fig(r.area_ha)} ha ({fig(r.area_ha * ACRES_PER_HA)} acres): {fig(used.amount)} {used.unit} in all
            </div>
            <div className={css.recordLine}>
              {r.site}
              {r.postcode && `, ${r.postcode}`} · {r.situation}
              {r.target && ` · ${r.target}`}
              {r.customer && ` · for ${r.customer}`}
            </div>
            <div className={css.recordMeta}>
              {r.operator}
              {r.certificate && ` (${r.certificate})`}
              {r.equipment && ` · ${r.equipment}`}
              {weather.length > 0 && ` · ${weather.join(', ')}`}
            </div>
            {r.notes && <div className={css.recordMeta}>{r.notes}</div>}
            <div className={css.recordActions}>
              <Link href={`/info/spray-diary?copy=${r.id}#add`} prefetch={false}>
                Copy to a new record
              </Link>
              {asking === r.id ? (
                <>
                  <button
                    type="button"
                    className={css.danger}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await deleteSprayRecordAction(r.id);
                        setError(res.error ?? null);
                        setAsking(null);
                      })
                    }
                  >
                    {pending ? 'Deleting…' : 'Yes, delete it'}
                  </button>
                  <button type="button" onClick={() => setAsking(null)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setAsking(r.id)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        );
      })}
      {error && (
        <li className={css.error} role="alert">
          {error}
        </li>
      )}
    </ul>
  );
}
