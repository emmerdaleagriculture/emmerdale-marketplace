'use client';

import { useActionState, useState } from 'react';
import { addLeadManualAction, importCsvAction } from './import-actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import a from '../../auth.module.css';
import s from '../admin.module.css';

export function LeadsIntakePanel() {
  const [open, setOpen] = useState<'none' | 'csv' | 'manual'>('none');
  const [csvState, csvAction, csvPending] = useActionState(importCsvAction, emptyFormState);
  const [manState, manAction, manPending] = useActionState(addLeadManualAction, emptyFormState);

  return (
    <div style={{ marginBottom: 24 }}>
      <div className={s.quickLinks}>
        <button type="button" className={f.btnPrimary} onClick={() => setOpen(open === 'csv' ? 'none' : 'csv')}>
          Import CSV
        </button>
        <button type="button" className={f.btnGhost} onClick={() => setOpen(open === 'manual' ? 'none' : 'manual')}>
          + Add lead manually
        </button>
      </div>

      {open === 'csv' && (
        <div className={a.card} style={{ marginTop: 14 }}>
          {csvState.error && <p className={f.error}>{csvState.error}</p>}
          {csvState.ok && <p className={f.success}>{csvState.message}</p>}
          <p className={f.hint} style={{ marginBottom: 12 }}>
            Export your leads from Facebook (Meta Business Suite → Leads Center →
            Download, or Ads Manager) and upload the CSV. Duplicate rows (same
            Facebook lead id) are skipped automatically.
          </p>
          <form action={csvAction}>
            <label className={f.field}>
              <span className={f.label}>Leads CSV</span>
              <input className={f.input} type="file" name="csv" accept=".csv,text/csv" required />
            </label>
            <button className={f.btnPrimary} type="submit" disabled={csvPending}>
              {csvPending ? 'Importing…' : 'Import'}
            </button>
          </form>
        </div>
      )}

      {open === 'manual' && (
        <div className={a.card} style={{ marginTop: 14 }}>
          {manState.error && <p className={f.error}>{manState.error}</p>}
          {manState.ok && <p className={f.success}>{manState.message}</p>}
          <form action={manAction}>
            <div className={a.row2}>
              <label className={f.field}>
                <span className={f.label}>Full name</span>
                <input className={f.input} name="full_name" required />
              </label>
              <label className={f.field}>
                <span className={f.label}>Phone</span>
                <input className={f.input} name="phone" />
              </label>
              <label className={f.field}>
                <span className={f.label}>Email</span>
                <input className={f.input} name="email" type="email" />
              </label>
              <label className={f.field}>
                <span className={f.label}>Postcode</span>
                <input className={f.input} name="postcode" />
              </label>
            </div>
            <label className={f.field}>
              <span className={f.label}>What they want</span>
              <textarea className={f.textarea} name="job_hint" placeholder="e.g. Paddock topping, ~4 acres, overgrown" />
            </label>
            <button className={f.btnPrimary} type="submit" disabled={manPending}>
              {manPending ? 'Adding…' : 'Add to queue'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
