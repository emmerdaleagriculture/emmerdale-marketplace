'use client';

import { useActionState } from 'react';
import { addAuditAllowlist, addProbeAllowlist } from './actions';
import type { FormState } from '@/lib/form';
import s from '../admin.module.css';
import f from '@/components/forms/forms.module.css';

const EMPTY: FormState = {};
const BTN = { padding: '6px 12px', fontSize: 12 } as const;
const INPUT = { padding: '4px 8px', fontSize: 12 } as const;

/** A range that never scores: home, office, the CI runner. */
export function AddProbeAllowlist() {
  const [state, action, pending] = useActionState(addProbeAllowlist, EMPTY);
  return (
    <form action={action}>
      <div className={s.actions} style={{ alignItems: 'center' }}>
        <input className={f.input} name="cidr" placeholder="203.0.113.0/24" required style={{ ...INPUT, width: 170 }} />
        <input className={f.input} name="reason" placeholder="Why it never scores (office, CI runner…)" required style={{ ...INPUT, width: 300 }} />
        <button type="submit" className={f.btnGhost} style={BTN} disabled={pending}>
          {pending ? 'Adding…' : 'Never score this range'}
        </button>
      </div>
      {state.error && <div className={f.error}>{state.error}</div>}
      {state.message && <div className={f.success}>{state.message}</div>}
    </form>
  );
}

/** An audit finding somebody has looked at and accepted, with the reason. */
export function AddAuditAllowlist() {
  const [state, action, pending] = useActionState(addAuditAllowlist, EMPTY);
  return (
    <form action={action}>
      <div className={s.actions} style={{ alignItems: 'center' }}>
        <select className={f.input} name="kind" defaultValue="rpc" style={{ ...INPUT, width: 140 }}>
          <option value="rpc">RPC</option>
          <option value="bucket_mime">Bucket MIME</option>
          <option value="policy">Policy</option>
        </select>
        <input className={f.input} name="item" placeholder="Exactly as the card lists it" required style={{ ...INPUT, width: 300 }} />
        <input className={f.input} name="reason" placeholder="Why it is acceptable" required style={{ ...INPUT, width: 300 }} />
        <button type="submit" className={f.btnGhost} style={BTN} disabled={pending}>
          {pending ? 'Adding…' : 'Accept this finding'}
        </button>
      </div>
      {state.error && <div className={f.error}>{state.error}</div>}
      {state.message && <div className={f.success}>{state.message}</div>}
    </form>
  );
}
