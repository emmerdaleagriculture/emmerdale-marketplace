'use client';

import { useActionState, useEffect, useRef } from 'react';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { inviteViewerAction, viewerAction } from './viewerActions';

export type ViewerRow = { id: number; email: string; name: string | null; accepted: boolean; lastSeen: string | null };

/**
 * Books › Settings: let an accountant, bookkeeper or partner see the books.
 * Read only for them, always; the owner can remove anyone at any time.
 */
export function ViewersSection({ viewers, max }: { viewers: ViewerRow[]; max: number }) {
  const [state, invite, inviting] = useActionState(inviteViewerAction, emptyFormState);
  const [rowState, act, acting] = useActionState(viewerAction, emptyFormState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <fieldset className={s.fieldset} style={{ marginTop: 24 }}>
      <legend>Accountant and others</legend>
      <p className={f.hint} style={{ margin: 0 }}>
        Let your accountant, bookkeeper or a partner see your books. They get an email with a link, sign in with that address, and can look
        at and download everything: ledger, reports, VAT, receipts, invoices and bank. They can’t change anything, and you can remove them
        at any time.
      </p>

      {viewers.length > 0 && (
        <ul className={s.viewerList}>
          {viewers.map((v) => (
            <li key={v.id}>
              <div>
                <b style={{ overflowWrap: 'anywhere' }}>{v.name || v.email}</b>
                {v.name && <span style={{ overflowWrap: 'anywhere' }}>{v.email}</span>}
                <span>{v.accepted ? (v.lastSeen ? `Last looked ${v.lastSeen}` : 'Has access') : 'Invited, not opened yet'}</span>
              </div>
              <form action={act} className={s.viewerButtons}>
                <input type="hidden" name="id" value={v.id} />
                {!v.accepted && (
                  <button type="submit" name="op" value="resend" className={f.btnGhost} disabled={acting}>
                    Resend
                  </button>
                )}
                <button type="submit" name="op" value="remove" className={f.btnGhost} disabled={acting}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {rowState.error && <p className={f.error}>{rowState.error}</p>}
      {rowState.message && <p className={f.hint}>{rowState.message}</p>}

      {viewers.length < max && (
        <form ref={form} action={invite} style={{ display: 'grid', gap: 12 }}>
          <label className={f.field}>
            <span className={f.label}>Their email</span>
            <input className={f.input} type="email" name="email" required maxLength={254} autoComplete="off" />
          </label>
          <label className={f.field}>
            <span className={f.label}>Their name (optional)</span>
            <input className={f.input} name="name" maxLength={120} placeholder="e.g. Sarah at Smith & Co" autoComplete="off" />
          </label>
          {state.error && <p className={f.error}>{state.error}</p>}
          {state.message && <p className={f.hint}>{state.message}</p>}
          <div>
            <button type="submit" className={f.btnPrimary} disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      )}
    </fieldset>
  );
}
