'use client';

import { useActionState, useState } from 'react';
import { setTextAlertsAction } from './actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: FormState = {};

/**
 * Opt in to texts for this job: when a price comes in and when a contractor
 * writes. Off until they ask, and the number they give here is for our texts
 * only.
 */
export function TextAlerts({
  token,
  on,
  phone,
  suggested,
}: {
  token: string;
  on: boolean;
  /** The number texts go to now, if on. */
  phone: string | null;
  /** A mobile they already gave with the job, to save typing it again. */
  suggested: string | null;
}) {
  const [state, action, pending] = useActionState(setTextAlertsAction, EMPTY);
  const [open, setOpen] = useState(false);

  if (on) {
    return (
      <form action={action} className={m.fixLine}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="on" value="0" />
        Texts on to {phone ? displayMobile(phone) : 'your mobile'}.{' '}
        <button type="submit" className={f.linkButton} disabled={pending}>
          Turn texts off
        </button>
        {state.error && <span className={f.error}> {state.error}</span>}
      </form>
    );
  }

  if (!open) {
    return (
      <p className={m.fixLine}>
        {state.ok && state.message ? `${state.message} ` : ''}
        <button type="button" className={f.linkButton} onClick={() => setOpen(true)}>
          Get text updates about this job
        </button>
      </p>
    );
  }

  return (
    <form action={action} className={m.awardPanel}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="on" value="1" />
      <label className={f.field}>
        <span className={f.label}>Your mobile</span>
        <input
          className={f.input}
          type="tel"
          name="phone"
          required
          autoComplete="tel"
          inputMode="tel"
          defaultValue={suggested ?? ''}
        />
        <span className={f.hint}>
          We&rsquo;ll text you when a price comes in and when a contractor messages you about
          this job, between 8am and 9pm. Only used for these texts. Reply STOP to any of them to stop.
        </span>
      </label>
      {state.error && <p className={f.error}>{state.error}</p>}
      <p>
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Turn texts on'}
        </button>{' '}
        <button type="button" className={f.btnGhost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </p>
    </form>
  );
}

/** "+447700900123" → "07700 900123". */
function displayMobile(e164: string): string {
  const d = e164.replace(/^\+44/, '0');
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}
