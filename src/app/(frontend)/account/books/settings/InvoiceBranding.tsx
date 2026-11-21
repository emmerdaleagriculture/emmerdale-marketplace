'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import { COLOUR_PRESETS, DEFAULT_INVOICE_COLOUR, MIN_CONTRAST, normaliseHex, readableColour } from '@/lib/books/branding';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { removeLogoAction, saveColourAction, uploadLogoAction } from './brandingActions';

/**
 * Books › Settings: the contractor's own logo and colour on their invoices
 * (PDF, the customer's invoice page and the email). The logo uploads as soon
 * as it's picked; the colour has its own Save. The preview beside them is
 * drawn here, and "See a sample invoice" renders the real PDF.
 */
export function InvoiceBranding({ logoUrl, colour, name }: { logoUrl: string | null; colour: string | null; name: string }) {
  const [logoState, upload, uploading] = useActionState(uploadLogoAction, emptyFormState);
  const [removeState, setRemoveState] = useState<FormState>(emptyFormState);
  const [removing, startRemove] = useTransition();
  const [, startUpload] = useTransition();
  const [colourState, saveColour, saving] = useActionState(saveColourAction, emptyFormState);
  const [hex, setHex] = useState(colour ?? DEFAULT_INVOICE_COLOUR);
  const [typed, setTyped] = useState(colour ?? DEFAULT_INVOICE_COLOUR);
  const input = useRef<HTMLInputElement>(null);

  const valid = normaliseHex(hex);
  const pale = valid ? !readableColour(valid) : false;
  const shown = valid && !pale ? valid : DEFAULT_INVOICE_COLOUR;
  const logoMsg = removeState.error || removeState.message ? removeState : logoState;

  function pick(next: string) {
    setTyped(next);
    const n = normaliseHex(next);
    if (n) setHex(n);
    else setHex(next);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRemoveState(emptyFormState);
    const fd = new FormData();
    fd.set('logo', file);
    startUpload(() => upload(fd));
  }

  return (
    <fieldset className={s.fieldset} style={{ marginTop: 24 }} id="branding">
      <legend>Invoice branding</legend>
      <p className={f.hint} style={{ margin: 0 }}>
        Your logo and colour go on every invoice you send from Books: the PDF, the page your customer opens, and the email.
      </p>

      <div className={s.brandPreview} style={{ borderTopColor: shown }} aria-label="Preview">
        <div>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className={s.brandLogo} />
          )}
          <div className={s.brandName} style={{ color: shown }}>
            {name}
          </div>
        </div>
        <div className={s.brandSide}>
          <div className={s.brandTitle} style={{ color: shown }}>
            INVOICE
          </div>
          <span className={s.brandButton} style={{ background: shown }}>
            View invoice
          </span>
        </div>
      </div>

      <div className={f.field}>
        <span className={f.label}>Logo</span>
        <div className={s.viewerButtons} style={{ justifyContent: 'flex-start' }}>
          <button type="button" className={f.chip} disabled={uploading || removing} onClick={() => input.current?.click()}>
            {uploading ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload your logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              className={f.btnGhost}
              disabled={uploading || removing}
              onClick={() => startRemove(async () => setRemoveState(await removeLogoAction()))}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
        <span className={f.hint}>PNG, JPEG or SVG. A wide logo on a clear or white background looks best.</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onFile} />
        {logoMsg.error && <p className={f.error}>{logoMsg.error}</p>}
        {logoMsg.ok && logoMsg.message && <p className={f.success}>{logoMsg.message}</p>}
      </div>

      <form action={saveColour} className={f.field}>
        <span className={f.label}>Colour</span>
        <div className={s.swatches} role="radiogroup" aria-label="Invoice colour">
          {COLOUR_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              role="radio"
              aria-checked={valid === p.hex}
              title={p.name}
              aria-label={p.name}
              className={s.swatch}
              style={{ background: p.hex }}
              onClick={() => pick(p.hex)}
            />
          ))}
          <input
            type="color"
            aria-label="Choose any colour"
            className={s.swatchPicker}
            value={valid ?? DEFAULT_INVOICE_COLOUR}
            onChange={(e) => pick(e.target.value)}
          />
          <input
            className={f.input}
            name="colour"
            value={typed}
            onChange={(e) => pick(e.target.value)}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            style={{ maxWidth: 120 }}
            aria-label="Colour as a hex code"
          />
        </div>
        {pale ? (
          <span className={f.error}>Too pale to read on white paper (it needs {MIN_CONTRAST}:1 contrast). Try a darker shade.</span>
        ) : (
          <span className={f.hint}>Used for your name, headings and the pay button. Pale colours are refused so it stays readable.</span>
        )}
        {colourState.error && <p className={f.error}>{colourState.error}</p>}
        {colourState.ok && colourState.message && <p className={f.success}>{colourState.message}</p>}
        <div className={s.viewerButtons} style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className={f.btnPrimary} disabled={saving || pale || !valid}>
            {saving ? 'Saving…' : 'Save colour'}
          </button>
          {colour && (
            // Not name="reset": a control called reset hides form.reset(),
            // which React calls after the action, and it threw.
            <button type="submit" name="use_default" value="1" className={f.btnGhost} disabled={saving} onClick={() => pick(DEFAULT_INVOICE_COLOUR)}>
              Use Emmerdale green
            </button>
          )}
        </div>
      </form>

      <p style={{ margin: 0 }}>
        <a className={s.link} href="/account/books/settings/sample-invoice" target="_blank" rel="noopener">
          See a sample invoice (PDF) →
        </a>
        <span className={f.hint}> Uses your saved details, logo and colour.</span>
      </p>
    </fieldset>
  );
}
