'use client';

import { useState, useTransition } from 'react';
import { runAuditNow } from './actions';
import type { FormState } from '@/lib/form';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

/** The weekly audit, now. Findings become cards; the summary line is here. */
export function RunAuditButton() {
  const [state, setState] = useState<FormState>({});
  const [running, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        className={f.btnGhost}
        style={{ padding: '6px 12px', fontSize: 12 }}
        disabled={running}
        onClick={() => start(async () => setState(await runAuditNow()))}
      >
        {running ? 'Auditing…' : 'Run the audit now'}
      </button>
      {(state.message || state.error) && (
        <div className={`${s.result} ${state.error ? s.resultBad : ''}`}>{state.error ?? state.message}</div>
      )}
    </div>
  );
}
