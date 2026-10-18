'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { sendPhoneCodeAction, verifyPhoneCodeAction, type PhoneState } from './actions';
import { RESEND_AFTER_S } from '@/lib/app/phoneRules';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './phone.module.css';

/** "+447700900123" → "07700 900123", the way a UK number is read out. */
function pretty(e164: string): string {
  const d = e164.replace(/^\+44/, '0');
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export function PhoneForm({
  side,
  next,
  role,
}: {
  side: 'customer' | 'contractor';
  next: string | null;
  role: string | null;
}) {
  const [sent, send, sending] = useActionState(sendPhoneCodeAction, {} as PhoneState);
  const [verified, verify, verifying] = useActionState(verifyPhoneCodeAction, {} as PhoneState);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [changing, setChanging] = useState(false);
  const [local, setLocal] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  const phone = sent.ok ? sent.phone : undefined;
  const onCode = !!phone && !changing;
  const lockedFor = verified.lockedFor ?? sent.lockedFor ?? 0;

  useEffect(() => {
    if (!onCode) return;
    setCode('');
    codeRef.current?.focus();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [onCode, sent.sentAt]);

  const secondsLeft = Math.max(0, RESEND_AFTER_S - Math.floor((now - (sent.sentAt ?? 0)) / 1000));
  const hidden = (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {role && <input type="hidden" name="role" value={role} />}
    </>
  );

  if (!onCode) {
    return (
      <form action={send} className={s.form}>
        {hidden}
        <div className={s.progress}>
          <span style={{ width: '50%' }} />
        </div>
        <h1 className={ui.title}>Add your mobile number</h1>
        <p className={s.lede}>
          {side === 'customer'
            ? 'So your contractor can arrange access, and we can text you when prices arrive. It’s kept private until you’re booked.'
            : 'So customers can reach you once they’ve booked, and we can text you when there’s a job to price.'}
        </p>
        {sent.error && <p className={f.error}>{sent.error}</p>}
        <label className={s.label} htmlFor="phone">
          Mobile number
        </label>
        <div className={s.row}>
          <span className={s.prefix} aria-hidden="true">
            🇬🇧 +44
          </span>
          <input
            id="phone"
            className={s.input}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="07700 900123"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            required
          />
        </div>
        <ul className={s.points}>
          <li className={s.point}>
            <span className={s.pointIcon} aria-hidden="true">
              <LockIcon />
            </span>
            <div>
              <b>{side === 'customer' ? 'Private until you book' : 'Private until you’re booked'}</b>
              <span>
                {side === 'customer'
                  ? 'Contractors can’t see your number before you accept a price.'
                  : 'Customers see your number only once they’ve accepted your price.'}
              </span>
            </div>
          </li>
          <li className={s.point}>
            <span className={s.pointIcon} aria-hidden="true">
              <BellIcon />
            </span>
            <div>
              <b>Texts 8am to 9pm only</b>
              <span>Reply STOP at any time.</span>
            </div>
          </li>
        </ul>
        <div className="appFooterCta">
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={sending || lockedFor > 0}>
            {sending ? 'Sending…' : 'Text me a code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={s.form}>
      <div className={s.progress}>
        <span style={{ width: '75%' }} />
      </div>
      <h1 className={ui.title}>Enter the 6-digit code</h1>
      <p className={s.lede}>
        Sent to {pretty(phone)}.{' '}
        <button type="button" className={s.change} onClick={() => setChanging(true)}>
          Change
        </button>
      </p>

      <form action={verify}>
        {hidden}
        <input type="hidden" name="phone" value={phone} />
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
            disabled={lockedFor > 0}
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
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={verifying || code.length < 6 || lockedFor > 0}>
            {verifying ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </form>

      <form action={send} className={s.resend}>
        {hidden}
        <input type="hidden" name="phone" value={phone} />
        {secondsLeft > 0 ? (
          <span className={s.muted}>Didn&rsquo;t get it? Resend in 0:{String(secondsLeft).padStart(2, '0')}</span>
        ) : (
          <button type="submit" className={s.change} disabled={sending || lockedFor > 0}>
            {sending ? 'Sending…' : 'Send a new code'}
          </button>
        )}
      </form>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" />
    </svg>
  );
}
