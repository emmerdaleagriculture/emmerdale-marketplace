'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Turnstile, turnstileEnabled } from '@/components/forms/Turnstile';
import { EmailField } from '@/components/forms/EmailField';
import { sendEmailCodeAction, verifyEmailCodeAction, type EmailCodeState } from './actions';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './email.module.css';

const RESEND_AFTER_S = 30;

/**
 * Email, then code. The code box is one input, not six: a single field is
 * what iPhone's "From Messages / Mail" suggestion fills, and the six boxes
 * are drawn over it. autocomplete="one-time-code" is what makes the
 * suggestion appear.
 */
export function EmailCodeForm({ role }: { role: string | null }) {
  const [sent, send, sending] = useActionState(sendEmailCodeAction, {} as EmailCodeState);
  const [verified, verify, verifying] = useActionState(verifyEmailCodeAction, {} as EmailCodeState);
  const [captchaToken, setCaptchaToken] = useState('');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [changing, setChanging] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Once a code has gone, the address and send time are kept here: a
  // refused resend must not throw the person back to an empty email box
  // with a valid code sitting in their inbox.
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [sentAt, setSentAt] = useState<number>(0);
  useEffect(() => {
    if (sent.ok && sent.email) {
      setEmail(sent.email);
      setSentAt(sent.sentAt ?? Date.now());
      setChanging(false);
    }
  }, [sent]);
  const onCode = !!email && !changing;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!onCode) return;
    setCode('');
    codeRef.current?.focus();
  }, [onCode, sentAt]);

  const secondsLeft = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));
  const captchaPending = turnstileEnabled && !captchaToken;

  if (!onCode) {
    return (
      <form action={send} className={s.form}>
        <h1 className={ui.title}>What&rsquo;s your email?</h1>
        <p className={s.lede}>We&rsquo;ll email you a 6-digit code. No password to remember.</p>
        {sent.error && <p className={f.error}>{sent.error}</p>}
        <EmailField name="email" required defaultValue={email ?? ''} />
        <Turnstile resetOn={sent} onToken={setCaptchaToken} />
        <p className={s.muted}>
          Have a password from the website?{' '}
          <Link href="/login?next=/app/continue" className={s.change}>
            Log in with it
          </Link>
        </p>
        <div className="appFooterCta">
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={sending || captchaPending}>
            {sending ? 'Sending…' : 'Email me a code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={s.form}>
      <h1 className={ui.title}>Enter the 6-digit code</h1>
      <p className={s.lede}>
        Sent to {email}.{' '}
        <button type="button" className={s.change} onClick={() => setChanging(true)}>
          Change
        </button>
      </p>

      <form action={verify}>
        <input type="hidden" name="email" value={email} />
        {role && <input type="hidden" name="role" value={role} />}
        <label className={s.otpWrap}>
          <span className="sr-only">Code</span>
          <input
            ref={codeRef}
            className={s.otpInput}
            name="token"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="6-digit code"
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
        {sent.error && <p className={f.error}>{sent.error}</p>}
        <div className="appFooterCta">
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={verifying || code.length < 6}>
            {verifying ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </form>

      <form action={send} className={s.resend}>
        <input type="hidden" name="email" value={email} />
        <Turnstile resetOn={sent} onToken={setCaptchaToken} />
        {secondsLeft > 0 ? (
          <span className={s.muted}>Didn&rsquo;t get it? Resend in 0:{String(secondsLeft).padStart(2, '0')}</span>
        ) : (
          <button type="submit" className={s.change} disabled={sending || captchaPending}>
            {sending ? 'Sending…' : 'Send a new code'}
          </button>
        )}
      </form>
    </div>
  );
}
