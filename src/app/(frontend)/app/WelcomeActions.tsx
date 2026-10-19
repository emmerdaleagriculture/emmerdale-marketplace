'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignInButtons } from '@/components/app/SignInButtons';
import { signInProvidersConfigured } from '@/lib/app/signInProviders';
import { OPERATOR_CTA, OPERATOR_QUESTION } from '@/lib/home/proposition';
import type { RoleIntent } from '@/lib/app/landing';
import s from './app.module.css';

/**
 * The sign-in half of the welcome screen. The role switch is a client-side
 * toggle so the buttons update at once; the choice rides along to the role
 * screen as ?role= on the continue URL.
 */
export function WelcomeActions({ initialIntent, appleFirst }: { initialIntent: RoleIntent; appleFirst: boolean }) {
  const [contractor, setContractor] = useState(initialIntent === 'contractor');
  const role = contractor ? 'contractor' : null;
  const next = role ? `/app/continue?role=${role}` : '/app/continue';
  const emailHref = role ? `/app/email?role=${role}` : '/app/email';
  // No Apple or Google until their client IDs are set: email is the only way in.
  const social = signInProvidersConfigured().length > 0;

  return (
    <div className={s.actions}>
      {contractor && (
        <p className={s.loginLinkRow} style={{ marginBottom: 2 }}>
          Sign in or apply with the account you&rsquo;ll run your business from.
        </p>
      )}
      {social && (
        <>
          <SignInButtons next={next} appleFirst={appleFirst} />
          <div className={s.or}>or</div>
        </>
      )}
      <Link href={emailHref} className={s.emailBtn}>
        <MailMark /> Continue with email
      </Link>
      <button type="button" className={s.switchRole} onClick={() => setContractor((v) => !v)}>
        {contractor ? (
          <span>
            Need work done on your land? <strong>Get prices</strong>
          </span>
        ) : (
          <span>
            {OPERATOR_QUESTION} <strong>{OPERATOR_CTA}</strong>
          </span>
        )}
        <span aria-hidden="true">›</span>
      </button>
      <p className={s.legal}>
        By continuing you agree to our{' '}
        <Link href={contractor ? '/terms' : '/customer-terms'}>terms</Link> and{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </div>
  );
}

function MailMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
