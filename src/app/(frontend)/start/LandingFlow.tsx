'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { PageTracker } from '@/components/PageTracker';
import { parseJobAction, recordLandingView, type ParseActionState } from './actions';
import { downscalePhoto } from './photoDownscale';

// The confirm step (and the map machinery it pulls in) is dead weight on
// first paint — split it out, and warm the chunk during the parse wait so
// it's ready the moment the result arrives.
const ConfirmStep = dynamic(() => import('./ConfirmStep').then((m) => m.ConfirmStep));
import { Turnstile, turnstileEnabled } from '@/components/forms/Turnstile';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';
import s from './start.module.css';

const EMPTY: ParseActionState = {};

/** Swap a file input's contents for the downscaled version, in place. */
async function downscaleInput(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const small = await downscalePhoto(file);
  if (small === file) return;
  const dt = new DataTransfer();
  dt.items.add(small);
  input.files = dt.files;
}

/**
 * The landing-page step machine. Step 1 (describe) is a real form that
 * server-renders; submitting runs the parse server action and, while pending,
 * renders a skeleton of the job spec in its place. A successful parse hands
 * over to <ConfirmStep> (steps 3–4). The parse result always renders — a
 * failed LLM call arrives as a deterministic-fallback result, never an error
 * page (spec §6.4).
 */
export function LandingFlow() {
  const [state, action, pending] = useActionState(parseJobAction, EMPTY);
  const [formTs, setFormTs] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [awaitingToken, setAwaitingToken] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef('');
  tokenRef.current = captchaToken;

  // The security check finishing while the customer waits → submit for them.
  useEffect(() => {
    if (awaitingToken && captchaToken) {
      setAwaitingToken(false);
      formRef.current?.requestSubmit();
    }
  }, [awaitingToken, captchaToken]);
  // Never hold a paid click hostage to a slow challenge: after 8s, submit
  // anyway and let the server-side verification decide.
  useEffect(() => {
    if (!awaitingToken) return;
    const t = setTimeout(() => {
      setAwaitingToken(false);
      formRef.current?.requestSubmit();
    }, 8000);
    return () => clearTimeout(t);
  }, [awaitingToken]);
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '', gclid: '' });
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoHint, setGeoHint] = useState('');
  const locationRef = useRef<HTMLInputElement>(null);
  const rawTextRef = useRef<HTMLTextAreaElement>(null);

  // "Use my location" (spec §4 step 1): browser geolocation → nearest postcode
  // via postcodes.io reverse lookup. The raw coords are kept as a fallback so
  // a failed reverse lookup still geocodes the submission.
  //
  // Accuracy handling: a silently-wrong postcode routes the job to the wrong
  // county, so a good fix (phones with GPS — the actual ad audience) fills
  // the box with a double-check nudge, while a coarse fix (desktops locating
  // by IP/Wi-Fi, kilometres out) declines to guess and says why. High
  // accuracy is tried first; desktops without location services time out on
  // it, so a coarse low-accuracy attempt follows before giving up.
  const GEO_ACCURACY_LIMIT_M = 1500;

  const getPosition = (highAccuracy: boolean) =>
    new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: highAccuracy,
        timeout: 8000,
        maximumAge: 60000,
      }),
    );

  const useMyLocation = async () => {
    if (!navigator.geolocation) {
      setGeoHint('This browser can’t share your location — type a postcode instead.');
      return;
    }
    setLocating(true);
    setGeoHint('');

    let pos: GeolocationPosition | null = null;
    let denied = false;
    try {
      pos = await getPosition(true);
    } catch (err) {
      denied = (err as GeolocationPositionError)?.code === 1;
      if (!denied) {
        try {
          pos = await getPosition(false); // desktops: coarse beats nothing
        } catch (err2) {
          denied = (err2 as GeolocationPositionError)?.code === 1;
        }
      }
    }

    if (!pos) {
      setGeoHint(
        denied
          ? 'Location is blocked for this site — allow it in your browser, or type a postcode.'
          : 'Couldn’t get a location fix — type a postcode instead.',
      );
      setLocating(false);
      return;
    }

    const { latitude, longitude, accuracy } = pos.coords;
    if (accuracy > GEO_ACCURACY_LIMIT_M) {
      const km = Math.max(2, Math.round(accuracy / 1000));
      setGeoHint(
        `Your device could only place you to within about ${km}km (usually a computer without GPS) — type the postcode instead.`,
      );
      setLocating(false);
      return;
    }

    setGeo({ lat: latitude, lng: longitude });
    try {
      // radius: the default 100m finds nothing in open countryside — a field
      // is routinely further than that from any postcode centroid. 2km (the
      // API maximum) trades precision for a hit; the customer can edit it,
      // and the raw coords are kept regardless.
      const res = await fetch(
        `https://api.postcodes.io/postcodes?lon=${longitude}&lat=${latitude}&limit=1&radius=2000`,
        { signal: AbortSignal.timeout(5000) },
      );
      const json = await res.json();
      const postcode: string | undefined = json?.result?.[0]?.postcode;
      if (postcode && locationRef.current) {
        locationRef.current.value = postcode;
        setGeoHint('Double-check that’s right — it’s the nearest postcode to your position.');
      } else {
        setGeoHint('Got your location — add the postcode if you know it.');
      }
    } catch {
      setGeoHint('Got your location — add the postcode if you know it.');
    }
    setLocating(false);
  };

  // The parse skeleton replaces the form in place — put the viewport back at
  // the top so the customer watches the skeleton, not empty space. The parse
  // takes a couple of seconds: spend them downloading the confirm-step chunk.
  useEffect(() => {
    if (pending) {
      window.scrollTo({ top: 0 });
      void import('./ConfirmStep');
    }
  }, [pending]);

  const viewLogged = useRef(false);
  useEffect(() => {
    setFormTs(String(Date.now()));
    const q = new URLSearchParams(window.location.search);

    // Handoff from the customer front page (/paddock-maintenance): it asks
    // these same two questions, so arrive with them already answered rather
    // than making the customer type it twice. Filled through the DOM, not
    // defaultValue, so the page stays statically renderable — and only into an
    // empty field, so it never clobbers what someone has started typing.
    // Capped like the fields themselves: maxLength only blocks typing, so a
    // hand-edited or shared URL would otherwise fill the box with more than
    // ParseSchema accepts and fail server-side after a full round trip.
    const prefill = (
      el: HTMLTextAreaElement | HTMLInputElement | null,
      value: string | null,
      max: number,
    ) => {
      if (el && !el.value && value?.trim()) el.value = value.trim().slice(0, max);
    };
    prefill(rawTextRef.current, q.get('job'), 2000);
    prefill(locationRef.current, q.get('loc'), 200);

    // `src` marks an internal hand-off (the paddock pages). It stands in as the
    // source only when there's no real ad attribution, so organic arrivals stop
    // counting as "(direct)" against the paid funnel — without ever putting a
    // utm_* param on an internal link, which would reset the GA4 session.
    const src = q.get('src');
    const source = q.get('utm_source') ?? (src ? `site:${src}` : '');
    const medium = q.get('utm_medium') ?? (src ? 'organic' : '');
    const campaign = q.get('utm_campaign') ?? '';
    const gclid = q.get('gclid') ?? '';
    setUtm({ source, medium, campaign, gclid });
    // One view per pageload — the ref guards React strict mode's double effect.
    if (!viewLogged.current) {
      viewLogged.current = true;
      // Not from inside the admin heat overlay's iframe: looking at the
      // report must not manufacture the arrivals it reports.
      if (window.self !== window.top) return;
      void recordLandingView({
        referrer: document.referrer,
        utm_source: source || undefined,
        utm_medium: medium || undefined,
        utm_campaign: campaign || undefined,
        gclid: gclid || undefined,
      });
    }
  }, []);

  if (state.ok && state.result) {
    return <ConfirmStep result={state.result} />;
  }

  if (pending) {
    return (
      <div className={a.card} aria-busy="true" aria-label="Working out the details of your job">
        <p className={s.skeletonNote}>Reading your description…</p>
        <div className={s.skeletonRow} style={{ width: '55%' }} />
        <div className={s.skeletonRow} style={{ width: '80%' }} />
        <div className={s.skeletonRow} style={{ width: '40%' }} />
        <div className={s.skeletonRow} style={{ width: '65%' }} />
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={a.card}
      onSubmit={(e) => {
        // The button is never disabled waiting for Turnstile — if the token
        // hasn't arrived yet, hold THIS submit and fire it the moment it does.
        if (turnstileEnabled && !tokenRef.current && !awaitingToken) {
          e.preventDefault();
          setAwaitingToken(true);
        }
      }}
    >
      <PageTracker path="/start" />
      {state.error && <p className={f.error}>{state.error}</p>}

      <input type="hidden" name="form_ts" value={formTs} />
      <input type="hidden" name="utm_source" value={utm.source} />
      <input type="hidden" name="utm_medium" value={utm.medium} />
      <input type="hidden" name="utm_campaign" value={utm.campaign} />
      <input type="hidden" name="gclid" value={utm.gclid} />
      {/* Honeypot — real users never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className={f.field}>
        <span className={f.label}>What needs doing?</span>
        <textarea
          ref={rawTextRef}
          className={f.textarea}
          name="raw_text"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder="e.g. I need my 7 acre field topped, it’s just off the A31 near Alresford"
          defaultValue={state.values?.raw_text}
        />
        <span className={f.hint}>Your own words are fine — no need for the technical term.</span>
      </label>

      <input type="hidden" name="geo_lat" value={geo?.lat ?? ''} />
      <input type="hidden" name="geo_lng" value={geo?.lng ?? ''} />

      <label className={f.field}>
        <span className={f.label}>Where is it? (postcode is ideal)</span>
        <div className={s.locationRow}>
          <input
            ref={locationRef}
            className={f.input}
            type="text"
            name="location_raw"
            autoComplete="postal-code"
            placeholder="e.g. SO24, or the nearest town"
            defaultValue={state.values?.location_raw}
          />
          <button type="button" className={f.btnGhost} onClick={useMyLocation} disabled={locating}>
            {locating ? 'Finding…' : 'Use my location'}
          </button>
        </div>
        {geoHint && <span className={f.hint}>{geoHint}</span>}
      </label>

      {/* Photos (spec §26a.3): optional, prompted specifically — a contractor
          reads more from one gateway photo than three paragraphs. Stored,
          never parsed; shown to contractors in Part 2. */}
      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Photo of the field (optional)</span>
          <input
            className={f.input}
            type="file"
            name="photo_field"
            accept="image/*"
            onChange={(e) => downscaleInput(e.currentTarget)}
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>Photo of the gateway or access (optional)</span>
          <input
            className={f.input}
            type="file"
            name="photo_access"
            accept="image/*"
            onChange={(e) => downscaleInput(e.currentTarget)}
          />
        </label>
      </div>

      <Turnstile resetOn={state} onToken={setCaptchaToken} />

      <div className={a.actions}>
        <button
          className={f.btnYellow}
          type="submit"
          disabled={pending || awaitingToken}
        >
          {awaitingToken ? 'One moment…' : pending ? 'Working…' : 'Get started'}
        </button>
      </div>

      {/* Why bother, for someone weighing this against asking in a Facebook
          group. Below the button deliberately: it reassures the hesitant
          without delaying anyone already convinced. */}
      <ul className={s.reassure}>
        <li>No trawling Facebook groups hoping someone answers.</li>
        <li>Insured contractors, vetted before they can quote.</li>
        <li>Several prices to choose from, not whoever replies first.</li>
        <li>Booked for when you actually want it, and it gets done.</li>
        <li>
          Your own job page — a private link with the prices, the contractor and
          where it&rsquo;s up to.
        </li>
        <li>We&rsquo;re on the end of the phone if you need us.</li>
        <li>
          We hold your payment and only release it once you and the contractor have
          both signed the job off.
        </li>
      </ul>
    </form>
  );
}
