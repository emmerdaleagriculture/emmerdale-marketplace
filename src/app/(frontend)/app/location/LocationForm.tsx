'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { lookupLandAction, saveSiteAction, type LandState } from './actions';
import { isNativeApp } from '@/lib/app/isApp';
import { rememberAsked, SITE_ASKED_COOKIE } from '@/lib/app/onboardingCookies';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './location.module.css';

/** A phone with GPS places you to tens of metres; a desktop by Wi-Fi to kilometres. */
const ACCURACY_LIMIT_M = 1500;

async function currentPosition(): Promise<{ lat: number; lng: number } | { error: string }> {
  try {
    if (isNativeApp()) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.requestPermissions();
      if (perm.location === 'denied') return { error: 'Location is off for this app. Allow it in Settings, or type a postcode.' };
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }),
    );
    if (pos.coords.accuracy > ACCURACY_LIMIT_M) {
      return { error: 'Your device could only place you roughly. Type the postcode instead.' };
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    return {
      error:
        code === 1
          ? 'Location is blocked for this app. Allow it, or type a postcode.'
          : 'Couldn’t get a location fix. Type a postcode instead.',
    };
  }
}

export function LocationForm({
  next,
  first,
  skipHref,
}: {
  next: string | null;
  /** The first site, asked during onboarding; later ones ask for a name. */
  first: boolean;
  skipHref: string;
}) {
  const [looked, lookup, looking] = useActionState(lookupLandAction, {} as LandState);
  const [saved, save, saving] = useActionState(saveSiteAction, {} as LandState);
  const [geoError, setGeoError] = useState('');
  const [locating, setLocating] = useState(false);
  const [postcode, setPostcode] = useState('');
  const geoForm = useRef<HTMLFormElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (looked.typed && !looked.error) setPostcode(looked.typed);
  }, [looked]);

  async function useMyLocation() {
    setGeoError('');
    setLocating(true);
    const pos = await currentPosition();
    setLocating(false);
    if ('error' in pos) return setGeoError(pos.error);
    if (latRef.current && lngRef.current && geoForm.current) {
      latRef.current.value = String(pos.lat);
      lngRef.current.value = String(pos.lng);
      geoForm.current.requestSubmit();
    }
  }

  // The result belongs to the postcode it was looked up for: retype it and
  // the card goes until it is checked again.
  const result = looked.ok && looked.typed && looked.typed.trim().toUpperCase() === postcode.trim().toUpperCase() ? looked.lookup : undefined;
  const covered = (result?.operators ?? 0) > 0;
  const unknown = result != null && result.operators == null;

  return (
    <div className={s.form}>
      <div className={s.progress}>
        <span />
      </div>
      <h1 className={ui.title}>{first ? 'Where’s your land?' : 'Add a field or paddock'}</h1>
      <p className={s.lede}>
        We&rsquo;ll check which approved operators cover it.
        {first ? ' You can save more than one field or paddock later.' : ''}
      </p>

      {/* Position → postcode: a form of its own, submitted by the button. */}
      <form ref={geoForm} action={lookup}>
        <input ref={latRef} type="hidden" name="lat" />
        <input ref={lngRef} type="hidden" name="lng" />
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={useMyLocation} disabled={locating || looking}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 3 10 21l-1-8-8-1L21 3Z" />
          </svg>
          {locating ? 'Finding you…' : 'Use my current location'}
        </button>
      </form>
      {geoError && <p className={f.error}>{geoError}</p>}

      <form action={lookup}>
        <label className={s.label} htmlFor="postcode">
          Or enter a postcode
        </label>
        <input
          id="postcode"
          className={s.input}
          name="postcode"
          autoComplete="postal-code"
          autoCapitalize="characters"
          placeholder="SO41 8AB"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          required
        />
        {looked.error && <p className={f.error}>{looked.error}</p>}
        {!result && (
          <button type="submit" className={`${ui.btn} ${ui.btnText}`} disabled={looking || postcode.trim().length < 2}>
            {looking ? 'Checking…' : 'Check coverage'}
          </button>
        )}
      </form>

      {result && (
        <form action={save}>
          {next && <input type="hidden" name="next" value={next} />}
          <input type="hidden" name="postcode" value={result.postcode} />
          <input type="hidden" name="county_id" value={result.countyId ?? ''} />
          <input type="hidden" name="lat" value={result.lat ?? ''} />
          <input type="hidden" name="lng" value={result.lng ?? ''} />
          <input type="hidden" name="first" value={first ? '1' : '0'} />
          <div className={s.map} aria-hidden="true">
            <MapSketch pins={Math.min(result.operators ?? 0, 6)} />
          </div>
          <div className={`${s.result} ${covered || unknown ? '' : s.resultNone}`}>
            <span className={s.resultIcon} aria-hidden="true">
              {covered ? '✓' : unknown ? '?' : '!'}
            </span>
            <div>
              <b>
                {covered
                  ? `Good news: ${result.operators} approved operator${result.operators === 1 ? '' : 's'} cover you`
                  : unknown
                    ? 'We’ll check coverage when you send a job'
                    : 'Not covered yet'}
              </b>
              <span>
                {[result.town ? `Near ${result.town}` : null, result.outcode, result.county].filter(Boolean).join(' · ')}
                {covered
                  ? ' · usually priced within 24 hours'
                  : unknown
                    ? ' · this postcode sits on a county line, so the count needs the job itself'
                    : ' · we’re recruiting here and will tell you when someone joins'}
              </span>
            </div>
          </div>
          {!result.full && <p className={f.error}>Add the rest of the postcode (like SO41 8AB) to save this field.</p>}
          <div className={s.row2}>
            <div>
              <label className={s.label} htmlFor="label">
                Call it
              </label>
              <input id="label" className={`${s.input} ${s.small}`} name="label" defaultValue={first ? 'Home paddock' : ''} placeholder="Top field" maxLength={60} />
            </div>
            <div>
              <label className={s.label} htmlFor="acres">
                Acres
              </label>
              <input id="acres" className={`${s.input} ${s.small}`} name="acres" inputMode="decimal" placeholder="4" />
            </div>
          </div>
          <p className={s.hint}>Rough is fine. The job flow measures it properly when you book.</p>
          {saved.error && <p className={f.error}>{saved.error}</p>}
          <div className="appFooterCta">
            <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving || !result.full}>
              {saving ? 'Saving…' : 'Continue'}
            </button>
            <a href={skipHref} className={`${ui.btn} ${ui.btnText}`} onClick={() => first && rememberAsked(SITE_ASKED_COOKIE)} style={{ marginTop: 6 }}>
              {first ? 'Skip for now' : 'Cancel'}
            </a>
          </div>
        </form>
      )}

      {!result && (
        <div className="appFooterCta">
          <a href={skipHref} className={`${ui.btn} ${ui.btnText}`} onClick={() => first && rememberAsked(SITE_ASKED_COOKIE)}>
            {first ? 'Skip for now' : 'Cancel'}
          </a>
        </div>
      )}
    </div>
  );
}

/** A decorative sketch: the pin, a radius, and a dot per operator. Not a map. */
function MapSketch({ pins }: { pins: number }) {
  const spots = [
    [62, 30], [130, 28], [38, 70], [128, 72], [80, 18], [24, 48],
  ].slice(0, pins);
  return (
    <svg viewBox="0 0 160 90" role="presentation">
      <rect width="160" height="90" fill="#dfe8d4" />
      <path d="M0 62c30-10 50 8 80 0s50-14 80-4v32H0z" fill="#d3dec6" />
      <path d="M0 70c40-6 60 10 100 2s40-6 60 0" stroke="#b9cfe6" strokeWidth="5" fill="none" />
      <path d="M20 0v90M90 0v90M0 40h160" stroke="#fff" strokeWidth="2.5" opacity="0.8" />
      <circle cx="80" cy="48" r="26" fill="#367c2b" opacity="0.12" stroke="#367c2b" strokeWidth="1.2" />
      {spots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#ffde00" stroke="#17330d" strokeWidth="1" />
      ))}
      <path d="M80 36a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" fill="#17330d" />
    </svg>
  );
}
