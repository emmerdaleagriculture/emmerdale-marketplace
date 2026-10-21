'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { baseLookupAction, submitApplicationAction, type LookupState } from './actions';
import { CONDUCT_VERSION } from '@/lib/contractors/conduct';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import { RadiusMap } from './RadiusMap';
import { nativeCamera, pickPhoto } from '@/lib/app/photos';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './apply.module.css';

type Step = 'business' | 'coverage' | 'checks' | 'review';
const STEPS: Step[] = ['business', 'coverage', 'checks', 'review'];

/**
 * Apply to join, from the app (PRD task 9). One form across four screens:
 * the earlier screens' inputs stay mounted (hidden) so a single submit
 * carries everything, files included.
 */
export function ApplyFlow({ services, contactName }: { services: ServiceOption[]; contactName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('business');
  const [looked, lookup, looking] = useActionState(baseLookupAction, {} as LookupState);
  const [state, submit, submitting] = useActionState(submitApplicationAction, emptyFormState);
  const [radius, setRadius] = useState(25);
  const [nationwide, setNationwide] = useState(false);
  const [postcode, setPostcode] = useState('');
  const [insurance, setInsurance] = useState<File | null>(null);
  const [certs, setCerts] = useState<File[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState({ account_name: '', sort_code: '', account_number: '' });
  const [agreed, setAgreed] = useState(false);
  const [stepError, setStepError] = useState('');
  // The postcode the last successful lookup placed, so a radius change can
  // reuse its position instead of geocoding again.
  const [placedFor, setPlacedFor] = useState('');
  useEffect(() => {
    if (looked.ok && looked.lat != null) setPlacedFor(postcode.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looked]);
  const formRef = useRef<HTMLFormElement>(null);
  const lookupForm = useRef<HTMLFormElement>(null);
  const insuranceInput = useRef<HTMLInputElement>(null);
  const certInput = useRef<HTMLInputElement>(null);

  const idx = STEPS.indexOf(step);
  const back = () => (idx === 0 ? router.back() : setStep(STEPS[idx - 1]));

  // Re-run the county lookup as the radius moves, a little after it stops.
  useEffect(() => {
    if (!looked.ok || !postcode) return;
    const t = setTimeout(() => lookupForm.current?.requestSubmit(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  // Files picked through the plugin or the input land in the real form via
  // a DataTransfer, so the one submit carries them.
  useEffect(() => {
    if (!insuranceInput.current) return;
    const dt = new DataTransfer();
    if (insurance) dt.items.add(insurance);
    insuranceInput.current.files = dt.files;
  }, [insurance]);
  useEffect(() => {
    if (!certInput.current) return;
    const dt = new DataTransfer();
    certs.forEach((c) => dt.items.add(c));
    certInput.current.files = dt.files;
  }, [certs]);

  async function snapInsurance() {
    if (nativeCamera()) {
      const file = await pickPhoto();
      if (file) setInsurance(file);
    } else {
      document.getElementById('insurance-pick')?.click();
    }
  }

  const bankDone = /^\d{2}-?\d{2}-?\d{2}$/.test(bank.sort_code) && /^\d{8}$/.test(bank.account_number) && bank.account_name.trim().length > 0;
  const canSubmit = !!insurance && bankDone && agreed && !submitting;
  const titles: Record<Step, string> = { business: 'Apply to join', coverage: 'Where you work', checks: 'Apply to join', review: 'Apply to join' };

  return (
    <main className={s.screen}>
      <div className={s.bar}>
        <button type="button" className={s.back} onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.barTitle}>{titles[step]}</span>
      </div>
      <div className={s.progress}><span style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>

      {/* The base postcode lookup, its own tiny form. */}
      <form ref={lookupForm} action={lookup} hidden>
        <input type="hidden" name="base_postcode" value={postcode} readOnly />
        <input type="hidden" name="radius" value={radius} readOnly />
        {looked.ok && looked.lat != null && (
          <>
            <input type="hidden" name="placed" value={placedFor} readOnly />
            <input type="hidden" name="lat" value={looked.lat} readOnly />
            <input type="hidden" name="lng" value={looked.lng ?? ''} readOnly />
            <input type="hidden" name="county" value={looked.county ?? ''} readOnly />
          </>
        )}
      </form>

      <form ref={formRef} action={submit}>
        <input type="hidden" name="radius" value={radius} />
        <input type="hidden" name="base_postcode" value={postcode} />
        <input ref={insuranceInput} type="file" name="insurance" hidden tabIndex={-1} />
        <input ref={certInput} type="file" name="certificates" multiple hidden tabIndex={-1} />
        {nationwide && <input type="hidden" name="nationwide" value="on" />}

        <div hidden={step !== 'business'}>
          <h1 className={ui.title}>Your business</h1>
          <p className={s.lede}>What customers will see once they&rsquo;ve booked you, and the work you take on.</p>
          <label className={s.label} htmlFor="business_name">Trading name</label>
          <input id="business_name" className={s.input} name="business_name" required autoComplete="organization" />
          <label className={s.label} htmlFor="contact_name">Your name</label>
          <input id="contact_name" className={s.input} name="contact_name" defaultValue={contactName} required autoComplete="name" />
          <label className={s.label}>What work do you do?</label>
          <ServicePicker services={services} selected={[]} />
        </div>

        <div hidden={step !== 'coverage'}>
          <h1 className={ui.title}>How far will you travel?</h1>
          <p className={s.lede}>From your base. Jobs inside this circle come to you to price.</p>
          <label className={s.label} htmlFor="pc">Base postcode</label>
          <input id="pc" className={s.input} value={postcode} onChange={(e) => setPostcode(e.target.value)} onBlur={() => postcode && lookupForm.current?.requestSubmit()} autoComplete="postal-code" autoCapitalize="characters" placeholder="SO41 8AB" />
          {looked.error && <p className={f.error}>{looked.error}</p>}
          {stepError && <p className={f.error}>{stepError}</p>}
          {!nationwide && (
            <>
              <label className={s.label} htmlFor="radius">Travel radius · <span className={s.radiusVal}>{radius} miles</span></label>
              <input id="radius" className={s.slider} type="range" min={5} max={100} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
              {looked.ok && looked.lat != null && looked.lng != null && <RadiusMap lat={looked.lat} lng={looked.lng} miles={radius} />}
              {looked.ok && looked.counties && (
                <p className={s.covers}>
                  Covers {looked.counties.length} {looked.counties.length === 1 ? 'county' : 'counties'}: {looked.counties.slice(0, 6).join(', ')}{looked.counties.length > 6 ? ` and ${looked.counties.length - 6} more` : ''}.
                </p>
              )}
            </>
          )}
          <label className={s.toggle}>
            <input type="checkbox" checked={nationwide} onChange={(e) => setNationwide(e.target.checked)} />
            <span>
              <b>Nationwide, for my services only</b>
              <br />
              <small style={{ color: 'var(--ink-3)' }}>For suppliers who deliver anywhere: hay, straw, haylage. You&rsquo;ll only be sent jobs for the services you picked.</small>
            </span>
          </label>
        </div>

        <div hidden={step !== 'checks'}>
          <h1 className={ui.title}>A few checks, then you&rsquo;re in</h1>
          <p className={s.lede}>We vet every operator before they see a job. Snap the certificate with your camera, no scanner needed.</p>
          <button type="button" className={`${s.check} ${insurance ? s.checkOn : ''}`} onClick={snapInsurance}>
            <span className={s.checkIcon} aria-hidden="true">{insurance ? '✓' : <CameraIcon />}</span>
            <span>
              <b>Public liability insurance</b>
              <span>{insurance ? insurance.name : 'Take a photo or choose a PDF'}</span>
            </span>
          </button>
          <input id="insurance-pick" type="file" accept="image/*,application/pdf" hidden onChange={(e) => setInsurance(e.target.files?.[0] ?? null)} />
          <button type="button" className={`${s.check} ${certs.length ? s.checkOn : ''}`} onClick={() => document.getElementById('cert-pick')?.click()}>
            <span className={s.checkIcon} aria-hidden="true">{certs.length ? '✓' : <DocIcon />}</span>
            <span>
              <b>Certificates <small>(optional)</small></b>
              <span>{certs.length ? `${certs.length} added` : 'NPTC, PA1, chainsaw tickets'}</span>
            </span>
          </button>
          <input id="cert-pick" type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => setCerts([...(e.target.files ?? [])].slice(0, 5))} />
          <button type="button" className={`${s.check} ${bankDone ? s.checkOn : ''}`} onClick={() => setBankOpen((v) => !v)}>
            <span className={s.checkIcon} aria-hidden="true">{bankDone ? '✓' : '£'}</span>
            <span>
              <b>Where we pay you</b>
              <span>{bankDone ? `••••${bank.account_number.slice(-4)}` : 'Your business bank account'}</span>
            </span>
          </button>
          {bankOpen && (
            <div className={s.bank}>
              <input className={s.input} name="account_name" placeholder="Name on the account" value={bank.account_name} onChange={(e) => setBank({ ...bank, account_name: e.target.value })} autoComplete="off" />
              <div className={s.row2}>
                <input className={s.input} name="sort_code" placeholder="Sort code" inputMode="numeric" value={bank.sort_code} onChange={(e) => setBank({ ...bank, sort_code: e.target.value })} autoComplete="off" />
                <input className={s.input} name="account_number" placeholder="Account number" inputMode="numeric" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} autoComplete="off" />
              </div>
              <p className={s.hint}>Used only to pay you. Payouts go out once the customer has paid in full and your invoice is in.</p>
            </div>
          )}
          {!bankOpen && (
            <>
              <input type="hidden" name="account_name" value={bank.account_name} />
              <input type="hidden" name="sort_code" value={bank.sort_code} />
              <input type="hidden" name="account_number" value={bank.account_number} />
            </>
          )}
          <label className={s.consent}>
            <input type="checkbox" name="conduct" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the <Link href="/terms" target="_blank">contractor terms</Link> and Code of Conduct ({CONDUCT_VERSION}), including same-day before and after photos and never taking work off the platform.
            </span>
          </label>
        </div>

        <div hidden={step !== 'review'}>
          <h1 className={ui.title}>Ready to send?</h1>
          <p className={s.lede}>We check applications by hand, usually within a few hours. You&rsquo;ll get a notification and a text when you&rsquo;re approved.</p>
          <ul className={ui.promises}>
            <li className={ui.promise}><span className={ui.tick} aria-hidden="true">✓</span><span><strong>Covering</strong> {nationwide ? 'nationwide, for your services' : `${radius} miles around ${postcode.toUpperCase() || 'your base'}`}</span></li>
            <li className={ui.promise}><span className={ui.tick} aria-hidden="true">✓</span><span><strong>Insurance</strong> {insurance ? 'attached' : 'missing'}</span></li>
            <li className={ui.promise}><span className={ui.tick} aria-hidden="true">✓</span><span><strong>Bank details</strong> {bankDone ? `••••${bank.account_number.slice(-4)}` : 'missing'}</span></li>
          </ul>
          {state.error && <p className={f.error} style={{ marginTop: 12 }}>{state.error}</p>}
        </div>

        <div className="appFooterCta">
          {/* Keyed apart: React would otherwise reuse the one element, and
              a click that turns Continue into Submit mid-dispatch submits. */}
          {step !== 'review' ? (
            <button
              key="continue"
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={(e) => {
                e.preventDefault();
                if (step === 'business') {
                  const form = formRef.current!;
                  if (!form.business_name.value.trim() || !form.contact_name.value.trim() || form.querySelectorAll('input[name="service_ids"]:checked').length === 0) {
                    form.reportValidity();
                    if (form.querySelectorAll('input[name="service_ids"]:checked').length === 0) alert('Pick at least one service.');
                    return;
                  }
                }
                if (step === 'coverage' && !postcode.trim()) {
                  setStepError('Enter your base postcode. We need it even for nationwide suppliers, for your records and payouts.');
                  return;
                }
                setStepError('');
                setStep(STEPS[idx + 1]);
              }}
              disabled={looking}
            >
              Continue
            </button>
          ) : (
            <button key="submit" type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={!canSubmit}>
              {submitting ? 'Sending…' : 'Submit application'}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
  );
}
