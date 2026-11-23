'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { emptyFormState } from '@/lib/form';
import type { SecretsSummary } from '@/lib/books/filing.server';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { removeFilingSecretAction, saveFilingSecretsAction } from './filingActions';

/**
 * Books › Settings: what year-end filing through TinyTax needs. Secrets are
 * write-only here: the page shows whether each is saved, never the value, and
 * a blank field keeps what's saved.
 */
export function FilingSettings({ saved, companyNumber, utr }: { saved: SecretsSummary; companyNumber: string | null; utr: string | null }) {
  const [state, save, saving] = useActionState(saveFilingSecretsAction, emptyFormState);
  const [rmState, remove, removing] = useActionState(removeFilingSecretAction, emptyFormState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  const savedNote = (on: boolean | string | null, which: string) =>
    on ? (
      <span className={f.hint}>
        Saved{typeof on === 'string' ? ` (${on})` : ''}.{' '}
        <button type="submit" form="filing-remove" name="which" value={which} className={s.link} disabled={removing} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          Remove
        </button>
      </span>
    ) : (
      <span className={f.hint}>Not saved.</span>
    );

  return (
    <fieldset className={s.fieldset} style={{ marginTop: 24 }} id="filing">
      <legend>Year-end filing (TinyTax)</legend>
      <p className={f.hint} style={{ margin: 0 }}>
        Books files your company accounts to Companies House and your CT600 to HMRC through{' '}
        <a className={s.link} href="https://tinytax.co.uk/developers" target="_blank" rel="noopener noreferrer">
          TinyTax
        </a>
        , on your own TinyTax subscription. What you save here is encrypted before it’s stored and only ever sent to TinyTax when you
        check or file. Nothing is filed until you press File on the{' '}
        <Link className={s.link} href="/account/books/year-end">
          Year end
        </Link>{' '}
        page.
      </p>
      <p className={f.hint}>
        Company number: <b>{companyNumber ?? 'not set (add it above)'}</b> · Corporation Tax UTR: <b>{utr ? 'saved' : 'not set (add it above)'}</b>
        {saved.test && (
          <>
            {' '}
            · <b>Test key</b>: checks and filings go to TinyTax’s sandbox, never HMRC or Companies House.
          </>
        )}
      </p>

      <form ref={form} action={save} style={{ display: 'grid', gap: 12 }} autoComplete="off">
        <label className={f.field}>
          <span className={f.label}>TinyTax API key</span>
          <input className={f.input} name="api_key" placeholder={saved.apiKey ? 'Leave blank to keep the saved key' : 'tt_live_…'} autoComplete="off" spellCheck={false} />
          {savedNote(saved.apiKey, 'apiKey')}
          <span className={f.hint}>From your TinyTax profile › API. It’s shown once there, so paste it straight in.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Government Gateway user ID (for the CT600)</span>
          <input className={f.input} name="gateway_id" inputMode="text" maxLength={14} placeholder={saved.gatewayId ? 'Leave blank to keep' : '12 characters'} autoComplete="off" spellCheck={false} />
          {savedNote(saved.gatewayId, 'gateway')}
        </label>
        <label className={f.field}>
          <span className={f.label}>Government Gateway password</span>
          <input className={f.input} name="gateway_password" type="password" placeholder={saved.gatewayPassword ? 'Leave blank to keep' : ''} autoComplete="new-password" />
          {savedNote(saved.gatewayPassword, 'gateway')}
          <span className={f.hint}>The company’s HMRC Corporation Tax login. Change it here whenever you change it at HMRC.</span>
        </label>
        <label className={f.field}>
          <span className={f.label}>Companies House authentication code (for the accounts)</span>
          <input className={f.input} name="auth_code" maxLength={6} placeholder={saved.authCode ? 'Leave blank to keep' : '6 characters'} autoComplete="off" spellCheck={false} style={{ textTransform: 'uppercase' }} />
          {savedNote(saved.authCode, 'authCode')}
        </label>
        {state.error && <p className={f.error}>{state.error}</p>}
        {state.message && <p className={f.hint}>{state.message}</p>}
        {rmState.error && <p className={f.error}>{rmState.error}</p>}
        {rmState.message && <p className={f.hint}>{rmState.message}</p>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="submit" className={f.btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {(saved.apiKey || saved.gatewayId || saved.gatewayPassword || saved.authCode) && (
            <button type="submit" form="filing-remove" name="which" value="all" className={f.btnGhost} disabled={removing}>
              Remove all
            </button>
          )}
        </div>
      </form>
      <form id="filing-remove" action={remove} hidden />
    </fieldset>
  );
}
