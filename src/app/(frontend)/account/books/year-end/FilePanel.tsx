'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { fileAction } from './actions';

/**
 * One File button (accounts or CT600) with the two confirmations it needs.
 * `blocked` says why it can't be pressed yet.
 */
export function FileButton({
  kind,
  periodEnd,
  blocked,
  sandbox,
}: {
  kind: 'ct600' | 'accounts';
  periodEnd: string;
  blocked: string | null;
  sandbox: boolean;
}) {
  const [state, file, filing] = useActionState(fileAction, emptyFormState);
  const to = kind === 'ct600' ? 'HMRC' : 'Companies House';
  const what = kind === 'ct600' ? 'CT600' : 'accounts';
  return (
    <form action={file} className={s.pointer} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="period_end" value={periodEnd} />
      <input type="hidden" name="kind" value={kind} />
      <div className={s.kind}>{kind === 'ct600' ? 'HMRC' : 'Companies House'}</div>
      <h3 style={{ margin: 0 }}>File the {what}</h3>
      {blocked ? (
        <p className={s.muted} style={{ margin: 0 }}>
          {blocked}
        </p>
      ) : (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" name="approve" required />
            <span>
              I’m a director. I’ve checked the figures above and approve the {what} being sent to {to} as the company’s
              {kind === 'ct600' ? ' return' : ' accounts'}.
            </span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" name="nil" required />
            <span>
              During the year the company had no off-balance sheet arrangements and no financial commitments, guarantees or
              contingencies outside the balance sheet, and gave directors no advances or credit other than any loan entered above.
            </span>
          </label>
          <div>
            <button type="submit" className={f.btnPrimary} disabled={filing}>
              {filing ? 'Sending…' : sandbox ? `Send to TinyTax sandbox` : `File with ${to}`}
            </button>
          </div>
        </>
      )}
      {state.error && <p className={f.error}>{state.error}</p>}
      {state.message && <p className={f.hint}>{state.message}</p>}
    </form>
  );
}

/** While a filing is on its way, look again every 30 seconds (the page polls TinyTax when due). */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
