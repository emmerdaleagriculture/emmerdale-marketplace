'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { hideDraftsAction, restoreDraftsAction } from './draft-actions';
import type { FormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import p from './submissions.module.css';

const EMPTY: FormState = {};

/**
 * Tick-and-clear for the drafts tab. The rows stay server-rendered — the
 * checkboxes are plain inputs named "ids" inside this form, so selection
 * needs no client state and the form still submits with JavaScript off.
 * This component only adds what needs the browser: select-all and a live
 * count on the button.
 */
export function DraftToolbar({
  count,
  showingHidden,
  children,
}: {
  /** How many drafts are listed, for the select-all label. */
  count: number;
  /** Restoring rather than clearing. */
  showingHidden?: boolean;
  children: React.ReactNode;
}) {
  const [state, act, pending] = useActionState(
    showingHidden ? restoreDraftsAction : hideDraftsAction,
    EMPTY,
  );
  const form = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState(0);

  // One listener on the form rather than controlled inputs, so the rows can
  // stay server components.
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const recount = () =>
      setPicked(el.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length);
    el.addEventListener('change', recount);
    recount();
    return () => el.removeEventListener('change', recount);
  }, [children]);

  function toggleAll(on: boolean) {
    const el = form.current;
    if (!el) return;
    for (const box of el.querySelectorAll<HTMLInputElement>('input[name="ids"]')) box.checked = on;
    setPicked(on ? count : 0);
  }

  const verb = showingHidden ? 'Put back' : 'Delete';

  return (
    <form action={act} ref={form}>
      <div className={p.draftBar}>
        <label className={p.draftAll}>
          <input type="checkbox" onChange={(e) => toggleAll(e.currentTarget.checked)} />
          <span>Select all {count}</span>
        </label>
        <button type="submit" className={f.btnGhost} disabled={pending || picked === 0}>
          {pending ? `${verb}ing…` : picked === 0 ? `${verb} selected` : `${verb} ${picked}`}
        </button>
        {state.error && <span className={f.error}>{state.error}</span>}
        {state.ok && <span className={f.success}>{state.message}</span>}
      </div>
      {children}
    </form>
  );
}
