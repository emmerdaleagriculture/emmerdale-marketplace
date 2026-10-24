'use client';

import { useActionState } from 'react';
import { payBalanceAction, type AcceptActionState } from './actions';
import f from '@/components/forms/forms.module.css';
import m from './my.module.css';
import { BANK_ACCOUNT_NAME, BANK_ACCOUNT_NUMBER, BANK_SORT_CODE } from '@/lib/site';

const EMPTY: AcceptActionState = {};

/**
 * The balance a job owes after sign-off (terms 7.2), in one of three states.
 *
 *  requested — the normal path since 2026-10-16: the customer pays, by card
 *           here (present for any bank check) or by bank transfer with the
 *           job's reference. Banks refused every unattended charge we tried.
 *  due    — sq_balance_auto_charge is on: the worker will charge the saved
 *           card; nothing to press. Saying so is the point.
 *  failed — the off-session charge gave up (expired card, a bank check that
 *           needs them present). Same button and bank details as requested,
 *           with the apology in front.
 *           The pay button is minted on demand — never a link in an email
 *           that can lapse. An operator marks a transfer on the admin page
 *           when it lands.
 *  paid   — handled by the caller; this component isn't rendered.
 */
export function PayBalance({
  token,
  amountLabel,
  dueLabel,
  mode,
  reference,
}: {
  token: string;
  amountLabel: string;
  dueLabel: string | null;
  mode: 'requested' | 'due' | 'failed';
  /** The bank-transfer reference for this job (site.ts paymentReference). */
  reference: string;
}) {
  const [state, action, pending] = useActionState(payBalanceAction, EMPTY);

  if (mode === 'due') {
    return (
      <p>
        The balance of <strong>{amountLabel}</strong> is due{dueLabel ? ` by ${dueLabel}` : ' now'}.
        We&rsquo;ll take it from the card you paid your deposit with. Nothing to do.
      </p>
    );
  }

  return (
    <div className={m.payPanel}>
      {mode === 'failed' ? (
        <p>
          We couldn&rsquo;t take the balance of <strong>{amountLabel}</strong> from the card
          you used for the deposit, usually an expired card, or a check your bank wants
          you to approve. You can settle it here{dueLabel ? `; it's due by ${dueLabel}` : '; it is due now'}.
        </p>
      ) : (
        <p>
          The balance of <strong>{amountLabel}</strong> is due{dueLabel ? ` by ${dueLabel}` : ' now, on receipt'}.
          Pay by card here, or by bank transfer below.
        </p>
      )}
      {state.error && <p className={f.error}>{state.error}</p>}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Opening payment…' : `Pay ${amountLabel}`}
        </button>
      </form>
      <p>Or pay by bank transfer, using the reference so we can match it to your job:</p>
      <dl className={m.bankDetails}>
        <dt>Account name</dt>
        <dd>{BANK_ACCOUNT_NAME}</dd>
        <dt>Sort code</dt>
        <dd>{BANK_SORT_CODE}</dd>
        <dt>Account number</dt>
        <dd>{BANK_ACCOUNT_NUMBER}</dd>
        <dt>Reference</dt>
        <dd>
          <strong>{reference}</strong>
        </dd>
      </dl>
      <p className={f.hint}>
        If something about the job isn&rsquo;t right, don&rsquo;t pay. Reply to any email
        from us and we&rsquo;ll sort it out first.
      </p>
    </div>
  );
}
