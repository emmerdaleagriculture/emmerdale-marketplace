'use client';

import { useActionState, useState, useTransition } from 'react';
import { backfillWindow, runScanNow } from './actions';
import type { FormState } from '@/lib/form';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};
const BTN = { padding: '6px 12px', fontSize: 12 } as const;

/**
 * Two ways to fire the detector by hand. "Scan now" is the live window, the
 * same call the cron makes, and it moves the heartbeat. A backfill scores a
 * past span (at most 24 h: the Analytics API returns short results on wider
 * windows), writes its rows as backfill=true and leaves the heartbeat alone.
 * Fourteen of them, a day each, is the backtest the guide asks for before
 * the alerts are trusted.
 */
export function DetectorControls() {
  const [scan, setScan] = useState<FormState>(EMPTY);
  const [scanning, start] = useTransition();
  const [bf, backfill, filling] = useActionState(backfillWindow, EMPTY);
  const [showBackfill, setShowBackfill] = useState(false);

  return (
    <div>
      <div className={s.actions}>
        <button
          type="button"
          className={f.btnGhost}
          style={BTN}
          disabled={scanning}
          onClick={() => start(async () => setScan(await runScanNow()))}
        >
          {scanning ? 'Scanning…' : 'Scan the last 30 minutes now'}
        </button>
        <button type="button" className={f.btnGhost} style={BTN} onClick={() => setShowBackfill((v) => !v)}>
          {showBackfill ? 'Hide backfill' : 'Backfill a past window'}
        </button>
      </div>
      {(scan.message || scan.error) && (
        <div className={`${s.result} ${scan.error ? s.resultBad : ''}`}>{scan.error ?? scan.message}</div>
      )}
      {showBackfill && (
        <form action={backfill} style={{ marginTop: 12 }}>
          <div className={s.actions} style={{ alignItems: 'flex-end' }}>
            <label className={f.label} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              From (UTC)
              <input className={f.input} type="datetime-local" name="window_start" required style={{ padding: '4px 8px', fontSize: 12 }} />
            </label>
            <label className={f.label} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              To (UTC)
              <input className={f.input} type="datetime-local" name="window_end" required style={{ padding: '4px 8px', fontSize: 12 }} />
            </label>
            <button type="submit" className={f.btnGhost} style={BTN} disabled={filling}>
              {filling ? 'Backfilling…' : 'Backfill'}
            </button>
          </div>
          <p className={s.metricHint} style={{ marginTop: 6 }}>
            Times are read as UTC. At most 24 hours per window. Rows are marked backfill and the heartbeat is not touched.
          </p>
          {(bf.message || bf.error) && (
            <div className={`${s.result} ${bf.error ? s.resultBad : ''}`}>{bf.error ?? bf.message}</div>
          )}
        </form>
      )}
    </div>
  );
}
