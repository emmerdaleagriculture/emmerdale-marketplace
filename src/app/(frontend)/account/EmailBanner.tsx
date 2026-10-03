'use client';

import { useActionState } from 'react';
import { requestEmailConfirmAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import ac from './account.module.css';

/**
 * Shown to a contractor whose address is on undeliverable_emails. While it is
 * there they get no email and no new jobs, so this sits above everything else
 * on the dashboard and asks for one thing: an address that works.
 */
export function EmailBanner({
  email,
  pending,
}: {
  email: string;
  pending: { email: string; sentAt: string } | null;
}) {
  const [state, action, busy] = useActionState(requestEmailConfirmAction, emptyFormState);

  return (
    <div className={`${ac.banner} ${ac.suspended}`} role="alert">
      <div className={ac.bannerTitle}>Fix your email address to get new jobs</div>
      <p className={ac.bannerText}>
        Emails to <b>{email}</b> are bouncing, so we’ve stopped sending you emails and new jobs.
        Enter an address that works, or the same one if you’ve fixed the problem, and confirm it
        from the link we send. Your sign-in email changes to match.
      </p>
      {state.ok ? (
        <p className={f.success}>{state.message}</p>
      ) : (
        <form action={action} className={ac.bannerForm}>
          <input
            className={f.input}
            type="email"
            name="email"
            required
            defaultValue={pending?.email ?? email}
            aria-label="Email address for jobs"
            autoComplete="email"
          />
          <button className={f.btnPrimary} type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send confirmation link'}
          </button>
        </form>
      )}
      {state.error && <p className={f.error}>{state.error}</p>}
      {!state.ok && pending && (
        <p className={ac.bannerNote}>
          A link went to {pending.email} earlier. Send another if it never arrived.
        </p>
      )}
    </div>
  );
}
