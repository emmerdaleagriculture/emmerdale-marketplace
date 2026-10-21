'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseJobAction, confirmJobAction, recordLandingView } from '@/app/(frontend)/start/actions';
import { claimJustSentJobAction } from './actions';
import { ServiceQuestions } from '@/app/(frontend)/start/ServiceQuestions';
import { hasAnswer, isAreaPriced, quantityFor, visibleChoices } from '@/lib/jobParse/conditions';
import { choicesFromPick, serviceFromPick } from '@/lib/jobParse/servicePick';
import { readFirstTouch } from '@/lib/firstTouch';
import { filesToPhotos, nativeCamera, pickPhoto } from '@/lib/app/photos';
import { Turnstile } from '@/components/forms/Turnstile';
import { ServiceTileIcon, type TileIcon } from '../home/popular';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './newjob.module.css';

export type FlowSite = {
  id: string;
  label: string;
  postcode: string;
  acres: number | null;
  lat: number | null;
  lng: number | null;
  countyId: number | null;
  operators: number | null;
  county: string | null;
};

type Step = 'service' | 'details' | 'photos' | 'review';
const STEPS: Step[] = ['service', 'details', 'photos', 'review'];

const ACCESS = [
  ['standard', 'Tractor fits'],
  ['narrow', 'Narrow gate'],
  ['unsure', 'Not sure'],
] as const;
const WHEN = [
  ['asap', 'Next 2 weeks'],
  ['within_month', 'This month'],
  ['flexible', 'Flexible'],
] as const;

const TILE_ICON: Record<string, TileIcon> = {
  topping: 'topping', mowing: 'mowing', harrowing: 'harrowing', rolling: 'rolling',
  'muck-sweeping': 'muck', overseeding: 'seed',
};

/**
 * Four screens, one question each (PRD task 8). The answers become the
 * same two calls the website's /start makes — parseJobAction (the draft,
 * from a description composed of the answers) and confirmJobAction (the
 * structured fields and contact details) — then the job is claimed to the
 * account and the app opens its page. Attribution: landing_path
 * /app/new-job plus whatever first-touch the device remembers.
 */
export function NewJobFlow({
  sites,
  contact,
  services,
  presetService,
}: {
  sites: FlowSite[];
  contact: { name: string; email: string; phone: string };
  services: { slug: string; name: string }[];
  presetService: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(presetService ? 'details' : 'service');
  const [slug, setSlug] = useState<string | null>(presetService);
  // A merged card ("Land & ditch clearance") stands for more than one
  // service; the customer picks which, as /start offers.
  const [chosenService, setChosenService] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(sites[0]?.id ?? null);
  const [postcode, setPostcode] = useState('');
  const [acresText, setAcresText] = useState<string>(String(sites[0]?.acres ?? 2));
  const acres = Number(acresText) || 0;
  const setAcres = (n: number) => setAcresText(String(Math.round(n * 100) / 100));
  const [quantity, setQuantity] = useState('');
  // The draft from the first successful parse: a refused confirm retries the
  // confirm, not the parse (no second draft, no second rate-limit hit).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [access, setAccess] = useState<string>('');
  const [when, setWhen] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Two named slots, field then gate: removing one must not relabel the other.
  const [photos, setPhotos] = useState<(File | null)[]>([null, null]);
  const photoList = photos.filter((p): p is File => !!p);
  const [name, setName] = useState(contact.name);
  const [captchaToken, setCaptchaToken] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // A required service question left blank: the first Send goes back and
  // asks; a second Send goes anyway (the website's rule — never a hard block).
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const [askedOnce, setAskedOnce] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const serviceChoices = useMemo(() => (slug && !serviceFromPick(slug) ? choicesFromPick(slug) : []), [slug]);
  const serviceName = useMemo(
    () => (slug ? serviceFromPick(slug) ?? (chosenService && serviceChoices.includes(chosenService as never) ? chosenService : null) : null),
    [slug, chosenService, serviceChoices],
  );
  const card = services.find((c) => c.slug === slug) ?? null;
  const areaPriced = isAreaPriced(serviceName);
  const quantityQ = quantityFor(serviceName);
  const questions = visibleChoices(serviceName, answers);
  const site = sites.find((x) => x.id === siteId) ?? null;
  const where = site?.postcode ?? postcode;
  const previews = useMemo(() => photos.map((p) => (p ? URL.createObjectURL(p) : null)), [photos]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  // Arriving counts as a landing view, so the sources report has a denominator.
  useEffect(() => {
    const touch = readFirstTouch();
    void recordLandingView({ path: '/app/new-job', handoff: 'app', ...(touch ?? {}) });
  }, []);
  // A different service means a different set of required questions.
  useEffect(() => {
    setAskedOnce(false);
    setAskedFor(null);
    setDraftId(null);
  }, [slug, chosenService]);

  const idx = STEPS.indexOf(step);
  const back = () => {
    if (idx === 0 || (idx === 1 && presetService)) router.back();
    else setStep(STEPS[idx - 1]);
  };

  const [slot, setSlot] = useState(0);
  const putPhoto = (i: number, file: File | null) => setPhotos((p) => p.map((x, j) => (j === i ? file : x)));
  async function addPhoto(i: number) {
    setSlot(i);
    if (nativeCamera()) {
      const file = await pickPhoto();
      if (file) putPhoto(i, file);
    } else {
      fileRef.current?.click();
    }
  }

  async function send() {
    if (!card || !where) return setError('Choose a service and tell us where the land is.');
    const missing = questions.find((q) => q.required && !hasAnswer(q, answers[q.key]));
    if (missing && !askedOnce) {
      setAskedOnce(true);
      setAskedFor(missing.key);
      setStep('details');
      return;
    }
    // What the confirm step would refuse, said here, before any draft exists.
    if (areaPriced && !(acres > 0)) return setError('Tell us roughly how big the land is.');
    if (!areaPriced && quantityQ && quantity && !/^\d+(\.\d+)?$/.test(quantity.trim())) return setError(`${quantityQ.label} needs to be a number.`);
    if (!site && !/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/.test(where.trim())) return setError('Enter the full postcode, like SO41 8AB.');
    setSending(true);
    setError('');
    try {
      // Step 1 of the website's intake: the draft, from a description built
      // out of the answers, plus the photos.
      const touch = readFirstTouch();
      const accessWords = access === 'standard' ? 'A tractor can get in through the gate.' : access === 'narrow' ? 'Access is through a narrow gate.' : '';
      const whenWords = when === 'asap' ? 'Ideally in the next two weeks.' : when === 'within_month' ? 'Some time this month.' : when === 'flexible' ? 'No rush on timing.' : '';
      const sizeWords = areaPriced ? `About ${acres} acres.` : quantityQ && quantity ? `${quantity} ${quantityQ.unit === 'linear_m' ? 'metres' : quantityQ.unit}.` : '';
      const raw = [card.name + '.', sizeWords, accessWords, whenWords, notes.trim()].filter(Boolean).join(' ');
      const fd = new FormData();
      fd.set('raw_text', raw);
      fd.set('location_raw', where);
      fd.set('service_hint', card.slug);
      fd.set('landing_path', '/app/new-job');
      fd.set('handoff', 'app');
      if (site?.lat != null && site?.lng != null) {
        fd.set('geo_lat', String(site.lat));
        fd.set('geo_lng', String(site.lng));
      }
      for (const [k, v] of Object.entries(touch ?? {})) if (v) fd.set(k, String(v));
      if (captchaToken) fd.set('cf-turnstile-response', captchaToken);
      if (photos[0]) fd.set('photo_field', photos[0], photos[0].name);
      if (photos[1]) fd.set('photo_access', photos[1], photos[1].name);
      let r: { submission_id: string; county_name: string | null; county_choice_reason: string | null; county_candidates: { id: number; name: string }[] };
      if (draftId) {
        r = { submission_id: draftId, county_name: site?.county ?? null, county_choice_reason: null, county_candidates: [] };
      } else {
        const parsed = await parseJobAction({}, fd);
        if (!parsed.ok || !parsed.result) throw new Error(parsed.error || 'Could not start the job.');
        r = parsed.result;
        setDraftId(r.submission_id);
      }
      // A typed postcode nobody could place would make a job that matches
      // nobody; the website asks for a county in that case, so stop here.
      if (!r.county_name && !site?.countyId && r.county_choice_reason === 'unplaced') {
        setDraftId(null);
        throw new Error('We couldn’t place that postcode. Check it, or add the field in Account first.');
      }

      // Step 2: confirm, with the structured answers and the contact details
      // the account already holds.
      const cd = new FormData();
      cd.set('submission_id', r.submission_id);
      cd.set('contact_name', name.trim());
      cd.set('contact_phone', contact.phone);
      cd.set('contact_email', contact.email);
      cd.set('contact_preference', contact.phone ? 'either' : 'email');
      cd.set('service_choice', serviceName ?? card.name);
      cd.set('service_confirmed', 'yes');
      if (areaPriced) {
        cd.set('area_value', String(acres));
        cd.set('area_unit', 'acres');
      } else if (quantityQ && quantity) {
        cd.set('area_value', quantity);
        cd.set('area_unit', quantityQ.unit);
      }
      cd.set('postcode', where);
      // The county the postcode settled, or the saved site's. An outcode on a
      // border offers two; the first is taken rather than leaving the job
      // matched to nobody — the same lean /start's picker asks the customer
      // to make, without a screen for it here.
      if (!r.county_name) {
        const countyId = site?.countyId ?? (r.county_choice_reason === 'border' ? r.county_candidates[0]?.id : null);
        if (countyId) cd.set('county_id', String(countyId));
      }
      if (when) cd.set('urgency', when);
      if (access) cd.set('gate_width', access);
      // The notes are already in the description (raw_text); access_notes is
      // the contractor spec's "Access" line and is not where they belong.
      // Condition answers go under the names the confirm step reads.
      for (const [k, v] of Object.entries(answers)) if (v) cd.set(`condition_${k}`, v);
      const confirmed = await confirmJobAction({}, cd);
      if (!confirmed.ok) throw new Error(confirmed.error || 'Could not send the job.');

      const { token } = await claimJustSentJobAction(r.submission_id);
      window.location.assign(token ? `/my/${token}` : '/my');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
      setSending(false);
    }
  }

  const titles: Record<Step, string> = {
    service: 'Get prices',
    details: card?.name ?? 'The land',
    photos: 'Photos',
    review: 'Check and send',
  };

  return (
    <main className={s.screen}>
      <div className={s.bar}>
        <button type="button" className={s.back} onClick={back} aria-label="Back">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className={s.barTitle}>{titles[step]}</span>
      </div>
      <div className={s.progress}>
        <span style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
      </div>

      {step === 'service' && (
        <>
          <h1 className={ui.title}>What needs doing?</h1>
          <p className={s.lede}>Pick one. You can add more detail next.</p>
          <div className={s.tiles}>
            {services.map((c) => (
              <button key={c.slug} type="button" className={`${s.tile} ${slug === c.slug ? s.tileOn : ''}`} onClick={() => setSlug(c.slug)}>
                <span>
                  {TILE_ICON[c.slug] && <ServiceTileIcon name={TILE_ICON[c.slug]} />}
                  {c.name}
                </span>
              </button>
            ))}
          </div>
          <div className="appFooterCta">
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} disabled={!slug} onClick={() => setStep('details')}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 'details' && (
        <>
          <h1 className={ui.title}>Tell us about the land</h1>
          {sites.length > 1 && (
            <>
              <p className={s.q}>Which field?</p>
              <div className={s.siteChips}>
                {sites.map((x) => (
                  <button key={x.id} type="button" className={`${s.chip} ${siteId === x.id ? s.chipOn : ''}`} onClick={() => { setSiteId(x.id); if (x.acres) setAcres(x.acres); }}>
                    {x.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {sites.length === 0 && (
            <>
              <p className={s.q}>Where is it?</p>
              <input className={s.input} value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode" autoComplete="postal-code" autoCapitalize="characters" />
            </>
          )}
          {serviceChoices.length > 0 && (
            <>
              <p className={s.q}>Which kind of work?</p>
              <div className={s.chips}>
                {serviceChoices.map((name) => (
                  <button key={name} type="button" className={`${s.chip} ${chosenService === name ? s.chipOn : ''}`} onClick={() => setChosenService(name)}>{name}</button>
                ))}
              </div>
            </>
          )}
          {areaPriced ? (
            <>
              <p className={s.q}>Roughly how big?</p>
              <div className={s.stepper}>
                <button type="button" className={s.stepBtn} onClick={() => setAcres(Math.max(0.25, acres - (acres > 2 ? 1 : 0.25)))} aria-label="Smaller">−</button>
                <div className={s.stepVal}>
                  <input inputMode="decimal" value={acresText} onChange={(e) => setAcresText(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} aria-label="Acres" />
                  acres
                </div>
                <button type="button" className={s.stepBtn} onClick={() => setAcres(acres + (acres >= 2 ? 1 : 0.25))} aria-label="Larger">+</button>
              </div>
              <p className={s.hint}>Not sure? A football pitch is about 1.75 acres.</p>
            </>
          ) : quantityQ ? (
            <>
              <p className={s.q}>{quantityQ.label}</p>
              <input className={s.input} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={quantityQ.hint ?? ''} />
            </>
          ) : null}
          <p className={s.q}>Can a tractor get in?</p>
          <div className={s.chips}>
            {ACCESS.map(([v, label]) => (
              <button key={v} type="button" className={`${s.chip} ${access === v ? s.chipOn : ''}`} onClick={() => setAccess(access === v ? '' : v)}>{label}</button>
            ))}
          </div>
          <p className={s.q}>When?</p>
          <div className={s.chips}>
            {WHEN.map(([v, label]) => (
              <button key={v} type="button" className={`${s.chip} ${when === v ? s.chipOn : ''}`} onClick={() => setWhen(when === v ? '' : v)}>{label}</button>
            ))}
          </div>
          {questions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <ServiceQuestions
                questions={questions}
                askedFor={askedFor}
                values={answers}
                onAnswer={(k, v) => {
                  setAnswers((a) => ({ ...a, [k]: v }));
                  if (k === askedFor) setAskedFor(null);
                }}
              />
            </div>
          )}
          <p className={s.q}>
            Anything else? <small>(optional)</small>
          </p>
          <textarea className={s.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Horses moved out on the 25th…" maxLength={1000} />
          <div className="appFooterCta">
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} disabled={!where || (serviceChoices.length > 0 && !chosenService)} onClick={() => setStep('photos')}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 'photos' && (
        <>
          <h1 className={ui.title}>Add a photo or two</h1>
          <p className={s.lede}>One of the field, one of the gate or access if you can. Operators price more confidently when they can see it.</p>
          <div className={s.photos}>
            {[0, 1].map((i) =>
              photos[i] ? (
                <div key={i} className={s.photo}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[i] ?? ''} alt="" />
                  <button type="button" className={s.photoRemove} onClick={() => putPhoto(i, null)} aria-label="Remove photo">×</button>
                </div>
              ) : (
                <button key={i} type="button" className={s.photo} onClick={() => addPhoto(i)}>
                  <span>
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                    <br />
                    {i === 0 ? 'The field' : 'The gate'}
                  </span>
                </button>
              ),
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const [file] = await filesToPhotos(e.target.files); if (file) putPhoto(slot, file); e.target.value = ''; }} />
          <div className="appFooterCta">
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setStep('review')}>
              {photoList.length ? 'Continue' : 'Skip photos'}
            </button>
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <h1 className={ui.title}>Ready to get prices?</h1>
          <div className={s.rows}>
            <div className={s.row}>
              <span className={s.rowIcon}>{TILE_ICON[slug ?? ''] ? <ServiceTileIcon name={TILE_ICON[slug!]} /> : '•'}</span>
              {serviceName ?? card?.name}
              <span className={s.rowVal}>{areaPriced ? `${acres} acres` : quantity || ''}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowIcon}>📍</span>
              {site?.label ?? 'Postcode'}
              <span className={s.rowVal}>{where}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowIcon}>🗓</span>
              {WHEN.find(([v]) => v === when)?.[1] ?? 'Timing open'}
              <span className={s.rowVal}>{ACCESS.find(([v]) => v === access)?.[1] ?? ''}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowIcon}>📷</span>
              Photos
              <span className={s.rowVal}>{photoList.length}</span>
            </div>
          </div>
          {!contact.name && (
            <>
              <p className={s.q}>Your name, for the operators who book</p>
              <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </>
          )}
          <div className={s.goes}>
            <span className={s.goesIcon} aria-hidden="true">→</span>
            <div>
              <b>
                {site?.operators != null && site.operators > 0
                  ? `Goes to ${site.operators} approved operator${site.operators === 1 ? '' : 's'}`
                  : 'Goes to the approved operators who cover you'}
              </b>
              <span>They can&rsquo;t see your name or number until you book.</span>
            </div>
          </div>
          <p className={s.note}>Free, with no obligation. You&rsquo;re not booking anything yet.</p>
          <Turnstile onToken={setCaptchaToken} />
          {error && <p className={f.error}>{error}</p>}
          <div className="appFooterCta">
            <button type="button" className={`${ui.btn} ${ui.btnYellow}`} onClick={send} disabled={sending || !name.trim()}>
              {sending ? 'Sending…' : 'Send for prices'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
