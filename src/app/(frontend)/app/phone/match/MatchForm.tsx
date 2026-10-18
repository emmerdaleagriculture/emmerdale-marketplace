'use client';

import { useActionState, useState } from 'react';
import { Turnstile, turnstileEnabled } from '@/components/forms/Turnstile';
import { declineMatchAction, sendMatchCodeAction, verifyMatchCodeAction, type MatchState } from './actions';
import f from '@/components/forms/forms.module.css';
import ui from '../../app-ui.module.css';
import s from '../phone.module.css';

export function MatchForm({
  emailMasked,
  kind,
  next,
  role,
}: {
  emailMasked: string;
  kind: 'customer' | 'contractor';
  next: string | null;
  role: string | null;
}) {
  const [sent, send, sending] = useActionState(sendMatchCodeAction, {} as MatchState);
  const [verified, verify, verifying] = useActionState(verifyMatchCodeAction, {} as MatchState);
  const [, decline, declining] = useActionState(declineMatchAction, {} as MatchState);
  const [captchaToken, setCaptchaToken] = useState('');
  const [code, setCode] = useState('');
  const captchaPending = turnstileEnabled && !captchaToken;

  const hidden = (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {role && <input type="hidden" name="role" value={role} />}
    </>
  );

  if (sent.step === 'code') {
    return (
      <form action={verify} className={s.form}>
        {hidden}
        <h1 className={ui.title}>Enter the code we emailed</h1>
        <p className={s.lede}>Sent to {emailMasked}. Entering it signs you in to that account.</p>
        <label className={s.otpWrap}>
          <span className="sr-only">Code</span>
          <input
            className={s.otpInput}
            name="token"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="6-digit code"
            autoFocus
          />
          <span className={s.otpBoxes} aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`${s.otpBox} ${code[i] ? s.otpFilled : ''}`}>
                {code[i] ?? ''}
              </span>
            ))}
          </span>
        </label>
        {verified.error && <p className={f.error}>{verified.error}</p>}
        <div className="appFooterCta">
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={verifying || code.length < 6}>
            {verifying ? 'Checking…' : 'Sign in to that account'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={s.form}>
      <h1 className={ui.title}>Is this you?</h1>
      <p className={s.lede}>
        This number is already verified on {kind === 'contractor' ? 'a contractor account' : 'an account'} with the
        email <strong>{emailMasked}</strong>. If that&rsquo;s yours, we&rsquo;ll sign you in there so you keep your{' '}
        {kind === 'contractor' ? 'business profile and jobs' : 'jobs'} rather than starting again.
      </p>
      <form action={send}>
        {hidden}
        {sent.error && <p className={f.error}>{sent.error}</p>}
        <Turnstile resetOn={sent} onToken={setCaptchaToken} />
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={sending || captchaPending}>
          {sending ? 'Sending…' : `Yes — email a code to ${emailMasked}`}
        </button>
      </form>
      <form action={decline} style={{ marginTop: 12 }}>
        {hidden}
        <button type="submit" className={`${ui.btn} ${ui.btnGhost}`} disabled={declining}>
          No, this is a new account
        </button>
      </form>
      <p className={ui.note}>
        Next time, &ldquo;Continue with email&rdquo; with that address takes you straight to it.
      </p>
    </div>
  );
}
