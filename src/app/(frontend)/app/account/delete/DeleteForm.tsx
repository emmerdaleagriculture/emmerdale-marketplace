'use client';

import { useActionState } from 'react';
import { deleteAccountAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import ui from '../../app-ui.module.css';

export function DeleteForm({ side, keeps }: { side: 'customer' | 'contractor' | 'both'; keeps: boolean }) {
  const [state, action, pending] = useActionState(deleteAccountAction, emptyFormState);
  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div className={ui.card} style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          <strong style={{ color: 'var(--ink)' }}>What goes:</strong> your login (including Apple or Google
          sign-in), your name, phone number and email, your device from our notifications, and
          {side === 'customer' ? ' any job still out for prices, which is withdrawn' : side === 'contractor' ? ' your place on the network' : ' any job still out for prices (withdrawn) and your place on the network'}.
        </p>
        {keeps ? (
          <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)', marginTop: 10 }}>
            <strong style={{ color: 'var(--ink)' }}>What stays:</strong> the record of{' '}
            {side === 'customer' ? 'booked jobs and payments' : 'jobs you priced, won or were paid for'}, without
            your personal details. We have to keep those for six years for tax and accounting law.
          </p>
        ) : (
          <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)', marginTop: 10 }}>
            Nothing else is kept.
          </p>
        )}
      </div>
      <label className={f.checkRow}>
        <input type="checkbox" name="confirm" required />
        <span>I understand this can&rsquo;t be undone.</span>
      </label>
      <div className="appFooterCta">
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} style={{ background: 'var(--error)' }} disabled={pending}>
          {pending ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </form>
  );
}
