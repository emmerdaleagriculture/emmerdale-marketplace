'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import f from '@/components/forms/forms.module.css';
import { cancelBankChangeAction, confirmBankCodeAction, requestBankCodeAction, type BankState } from './actions';

const EMPTY: BankState = {};

/**
 * Change bank details in two steps: the new details (we email a code), then
 * the code. Nothing changes until the code is right. Each code sent starts
 * a fresh code step, so a wrong code or a cancel never carries over.
 */
export function BankForm({ hasDetails, holdHours }: { hasDetails: boolean; holdHours: number }) {
  const [open, setOpen] = useState(!hasDetails);
  const [asked, ask, asking] = useActionState(requestBankCodeAction, EMPTY);
  // Bumped by every code sent; the code step is keyed on it.
  const [round, setRound] = useState(0);
  const [onCode, setOnCode] = useState(false);
  const [restart, setRestart] = useState<string | null>(null);
  const [done, setDone] = useState<BankState | null>(null);

  useEffect(() => {
    if (asked.step === 'code') {
      setRound((r) => r + 1);
      setOnCode(true);
      setRestart(null);
    }
  }, [asked]);

  if (done) {
    return (
      <div role="status" className={f.success} style={{ padding: '12px 14px', borderRadius: 12 }}>
        Done. We’ll pay you into the account ending {done.last4}
        {done.held ? `, starting in ${holdHours} hours` : ''}. We’ve emailed you to confirm.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={f.btnPrimary} onClick={() => setOpen(true)}>
        Change bank details
      </button>
    );
  }

  if (onCode) {
    return (
      <CodeStep
        key={round}
        sentTo={asked.sentTo ?? 'your email'}
        onDone={setDone}
        onBack={(why) => {
          setOnCode(false);
          setRestart(why);
        }}
      />
    );
  }

  const error = asked.step ? restart : (asked.error ?? restart);
  return (
    <form action={ask} style={{ display: 'grid', gap: 12 }}>
      <label className={f.field}>
        <span className={f.label}>Name on the account</span>
        <input className={f.input} name="account_name" required maxLength={70} autoComplete="off" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
        <label className={f.field}>
          <span className={f.label}>Sort code</span>
          <input className={f.input} name="sort_code" required inputMode="numeric" placeholder="12-34-56" maxLength={8} autoComplete="off" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Account number</span>
          <input className={f.input} name="account_number" required inputMode="numeric" placeholder="12345678" maxLength={9} autoComplete="off" />
        </label>
      </div>
      {error && (
        <p className={f.error} role="alert">
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className={f.btnPrimary} disabled={asking}>
          {asking ? 'Sending code…' : 'Email me a code'}
        </button>
        {hasDetails && (
          <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
            Keep my current details
          </button>
        )}
      </div>
    </form>
  );
}

function CodeStep({ sentTo, onDone, onBack }: { sentTo: string; onDone: (s: BankState) => void; onBack: (why: string | null) => void }) {
  const [state, confirm, confirming] = useActionState(confirmBankCodeAction, EMPTY);
  const [cancelling, startCancel] = useTransition();

  useEffect(() => {
    if (state.step === 'done') onDone(state);
    // A code that expired or ran out of tries: back to the details.
    else if (state.error && state.step !== 'code') onBack(state.error);
  }, [state, onDone, onBack]);

  return (
    <form action={confirm} style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>
        We’ve emailed a 6-digit code to <strong>{sentTo}</strong>. Enter it to make the change.
      </p>
      <label className={f.field}>
        <span className={f.label}>Code</span>
        <input
          className={f.input}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          style={{ letterSpacing: '0.3em', fontSize: 20, maxWidth: 200 }}
        />
      </label>
      {state.error && state.step === 'code' && (
        <p className={f.error} role="alert">
          {state.error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className={f.btnPrimary} disabled={confirming || cancelling}>
          {confirming ? 'Checking…' : 'Confirm change'}
        </button>
        <button
          type="button"
          className={f.btnGhost}
          disabled={confirming || cancelling}
          onClick={() =>
            startCancel(async () => {
              await cancelBankChangeAction();
              onBack(null);
            })
          }
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
