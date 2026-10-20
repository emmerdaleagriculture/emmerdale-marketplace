'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/app/isApp';
import { openInAppBrowser } from '@/lib/app/browser';
import { acceptQuoteAction, type AcceptActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';

const EMPTY: AcceptActionState = {};

/**
 * The awaiting-payment state (§27): one tap re-fetches the live payment link
 * (or mints a fresh one if the old link lapsed) — retry is never a fresh
 * decision.
 */
export function PayNow({
  token,
  quoteId,
  label,
  amountLabel,
}: {
  token: string;
  quoteId: string;
  label: string;
  amountLabel: string;
}) {
  const [state, action, pending] = useActionState(acceptQuoteAction, EMPTY);
  const router = useRouter();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  useEffect(() => {
    if (!state.url) return;
    openInAppBrowser(state.url).then((how) => {
      if (how === 'closed') router.refresh();
    });
  }, [state, router]);

  return (
    <div className={m.payPanel}>
      <p>
        You&rsquo;ve accepted <strong>{label}</strong> at <strong>{amountLabel}</strong>.
        Complete the deposit to confirm the booking. The payment link is valid for
        24 hours.
      </p>
      {state.error && <p className={f.error}>{state.error}</p>}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="client_quote_id" value={quoteId} />
        {native && <input type="hidden" name="in_app" value="1" />}
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Opening payment…' : 'Pay now'}
        </button>
      </form>
      <p className={f.hint}>
        If the link runs out, nothing is booked and no money is taken. Your prices
        stay here to accept again.
      </p>
    </div>
  );
}
