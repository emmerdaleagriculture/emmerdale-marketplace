'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { PageTracker, trackStep } from '@/components/PageTracker';
import { submitForm } from '@/lib/submitForm';
import { parseJobAction, recordLandingView, type ParseActionState } from './actions';
import { downscalePhoto } from './photoDownscale';
import { HOME_SERVICES } from '@/lib/home/services';

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
  // A parse error is a milestone too: it is where the flow broke for them.
  useEffect(() => {
    if (state.error) trackStep('parse_error');
  }, [state.error]);
  const [formTs, setFormTs] = useState('');
  // Arriving from the home page widget with the service AND a postcode
  // already chosen: this step would only show them back what they picked and
  // ask for a second "Get my prices" press. Send it for them instead and
  // land them straight on the details (Tom, 2026-09-23). The form stays
  // mounted off-screen meanwhile, because the Turnstile widget inside it has
  // to render to issue its token.
  const [autoSend, setAutoSend] = useState(false);
  const autoFired = useRef(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [awaitingToken, setAwaitingToken] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef('');
  tokenRef.current = captchaToken;
  // Set only by the 8s escape hatch, so its deliberate tokenless submit is
  // not caught by the hold below and bounced straight back into waiting.
  const gaveUpRef = useRef(false);

  // The security check finishing while the customer waits → submit for them.
  useEffect(() => {
    if (awaitingToken && captchaToken) {
      setAwaitingToken(false);
      submitForm(formRef.current);
    }
  }, [awaitingToken, captchaToken]);

  // The widget sits below the button so the button itself clears the fold,
  // which is fine while the challenge passes silently — but a managed
  // challenge sometimes wants a tick, and an unticked box the customer
  // cannot see reads as a dead button. If we end up waiting, put the thing
  // being waited on in front of them.
  useEffect(() => {
    const el = captchaRef.current;
    // Off-screen during an automatic send; scrolling to it would drag the
    // page sideways to nothing. The 8s hatch covers a challenge that stalls.
    if (!awaitingToken || !el || autoSend) return;
    // Already on screen (any desktop, and a phone mid-form) — scrolling then
    // just yanks the page out from under a thumb that is about to press.
    const box = el.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }, [awaitingToken, autoSend]);
  // Never hold a paid click hostage to a slow challenge: after 8s, submit
  // anyway and let the server-side verification decide. It decides to let it
  // through (verifyTurnstile, softFail 'missing-token'); it used to reject,
  // which turned every slow widget into a dead end.
  useEffect(() => {
    if (!awaitingToken) return;
    const t = setTimeout(() => {
      gaveUpRef.current = true;
      setAwaitingToken(false);
      submitForm(formRef.current);
    }, 8000);
    return () => clearTimeout(t);
  }, [awaitingToken]);
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '', gclid: '' });
  // The front page's service pick, by card slug. The server decides what it
  // means (serviceFromPick); this only carries it across.
  const [serviceHint, setServiceHint] = useState('');
  // "Something else" picked in the job list: no service, describe it below.
  const [describing, setDescribing] = useState(false);
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

  // Not before 3.2s after render: the server treats a submission inside
  // three seconds as a bot (the minimum-fill-time trap), and an automatic
  // send is exactly that fast. The usual token hold in onSubmit still applies.
  useEffect(() => {
    if (!autoSend || !formTs || autoFired.current) return;
    const wait = Math.max(0, 3200 - (Date.now() - Number(formTs)));
    const t = setTimeout(() => {
      if (autoFired.current) return;
      autoFired.current = true;
      // onSubmit still records 'send', so the journey curve (send → parsed)
      // stays whole; this marks which of those the page pressed itself.
      trackStep('auto_send');
      // Once only: a reload or a Back to this URL would otherwise send it
      // again and mint a second draft. auto=0 leaves the prefill intact, so
      // they land on step 1 with their answers still in it.
      const url = new URL(window.location.href);
      url.searchParams.set('auto', '0');
      window.history.replaceState(window.history.state, '', url);
      submitForm(formRef.current);
    }, wait);
    return () => clearTimeout(t);
  }, [autoSend, formTs]);
  // Anything the server refuses puts the ordinary form back in front of them.
  useEffect(() => {
    if (state.error) setAutoSend(false);
  }, [state.error]);

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
    // A card pick fills the job list below instead of typing its name into
    // the box — the box is for anything else they want to say. Only a `job`
    // with no recognised pick (the paddock pages' free text) goes in the box.
    const pickedSlug = q.get('service');
    if (!HOME_SERVICES.some((c) => c.slug === pickedSlug)) {
      prefill(rawTextRef.current, q.get('job'), 2000);
    }
    prefill(locationRef.current, q.get('loc'), 200);
    setServiceHint((q.get('service') ?? '').slice(0, 60));
    if (
      q.get('src') === 'home' &&
      q.get('auto') !== '0' &&
      q.get('job')?.trim() &&
      q.get('loc')?.trim()
    ) {
      setAutoSend(true);
    }

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

  // The beacon lives above every branch: it has to still be there when the
  // confirm step reports its milestones, and one tab is one visit whichever
  // step it is on.
  if (state.ok && state.result) {
    return (
      <>
        <PageTracker path="/start" />
        <ConfirmStep result={state.result} />
      </>
    );
  }

  const skeleton = (tracker: boolean) => (
    <div
      className={`${a.card} ${s.card}`}
      aria-busy="true"
      aria-label="Working out the details of your job"
    >
      {tracker && <PageTracker path="/start" />}
      <p className={s.skeletonNote}>Reading your description…</p>
      <div className={s.skeletonRow} style={{ width: '55%' }} />
      <div className={s.skeletonRow} style={{ width: '80%' }} />
      <div className={s.skeletonRow} style={{ width: '40%' }} />
      <div className={s.skeletonRow} style={{ width: '65%' }} />
    </div>
  );

  if (pending) return skeleton(true);

  return (
    <>
    {/* The form's own PageTracker is still mounted, so no second beacon. */}
    {autoSend && skeleton(false)}
    <form
      ref={formRef}
      action={action}
      aria-hidden={autoSend || undefined}
      style={
        autoSend
          ? { position: 'absolute', left: '-9999px', top: 0, width: 360 }
          : undefined
      }
      className={`${a.card} ${s.card}`}
      onSubmit={(e) => {
        trackStep('send');
        // No token yet → hold THIS submit and fire it the moment one lands.
        // The escape hatch's own submit is exempt, marked as it is fired.
        //
        // That exemption used to be `!awaitingToken`, which read as the same
        // thing and is not: any second press while the first was still held
        // also saw it, and went to the server bare. The button is disabled
        // while waiting, but the hatch re-enables it 8s in, so a customer who
        // pressed again then took that path — which is how the widget being
        // slow reached the server as a submission with no token at all.
        if (gaveUpRef.current) {
          gaveUpRef.current = false;
          return;
        }
        if (turnstileEnabled && !tokenRef.current) {
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
      <input type="hidden" name="service_hint" value={serviceHint} />
      {/* Honeypot — real users never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* The same job list as the home page widget. Ad clicks land here, not
          on the home page, and until now had to type the service in words. */}
      <label className={f.field}>
        <span className={f.label}>The job</span>
        <select
          className={f.input}
          value={serviceHint || (describing ? 'other' : '')}
          onChange={(e) => {
            const v = e.target.value;
            setDescribing(v === 'other');
            setServiceHint(v === 'other' ? '' : v);
            trackStep('picked');
          }}
        >
          <option value="">Choose a service…</option>
          {HOME_SERVICES.map((svc) => (
            <option key={svc.slug} value={svc.slug}>
              {svc.name}
            </option>
          ))}
          <option value="other">Something else — I&rsquo;ll describe it</option>
        </select>
      </label>

      <label className={f.field}>
        <span className={f.label}>
          {serviceHint ? 'Anything else we should know? (optional)' : 'What needs doing?'}
        </span>
        <textarea
          ref={rawTextRef}
          onInput={() => trackStep('typed')}
          className={f.textarea}
          name="raw_text"
          // Optional once a service is picked: its name is the description.
          required={!serviceHint}
          // Matches ParseSchema. Where they disagree the browser wins and
          // refuses with a tooltip we never see and cannot record.
          minLength={3}
          maxLength={2000}
          rows={3}
          placeholder={
            serviceHint
              ? 'e.g. about 7 acres, just off the A31 near Alresford'
              : 'e.g. I need my 7 acre field topped, it’s just off the A31 near Alresford'
          }
          defaultValue={state.values?.raw_text}
        />
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
          never parsed; shown to contractors in Part 2.

          Folded shut by default: expanded, the two file inputs are 180px of
          optional work standing between the description and the button, and
          on a phone that is the difference between seeing the button and
          not. The prompt survives; only the fields wait to be asked for. */}
      <details className={s.photos}>
        <summary>Add photos (optional)</summary>
        <div className={a.row2}>
          <label className={f.field}>
            <span className={f.label}>Photo of the field</span>
            <input
              className={f.input}
              type="file"
              name="photo_field"
              accept="image/*"
              onChange={(e) => downscaleInput(e.currentTarget)}
            />
          </label>
          <label className={f.field}>
            <span className={f.label}>Photo of the gateway or access</span>
            <input
              className={f.input}
              type="file"
              name="photo_access"
              accept="image/*"
              onChange={(e) => downscaleInput(e.currentTarget)}
            />
          </label>
        </div>
      </details>

      <div className={`${a.actions} ${s.actions}`}>
        <button
          className={`${f.btnYellow} ${s.submit}`}
          type="submit"
          disabled={pending || awaitingToken}
        >
          {/* Not "Get my prices": the next screen has none, and saying so was
              the likeliest reason people left it (see ConfirmStep). */}
          {awaitingToken ? 'One moment…' : pending ? 'Working…' : 'Next'}
        </button>
        <p className={s.noObligation}>
          Free, and no obligation — you&rsquo;re not booking anything yet.
        </p>
      </div>

      {/* Below the button, not above it. The widget is 80px of machinery the
          customer never interacts with, and above the button that 80px was
          the difference between seeing the button on a phone and not. The
          submit path is unchanged either way: the token lands in a hidden
          input in this same form, and a press before the challenge resolves
          is already held and replayed by the handler above. */}
      <div ref={captchaRef}>
        <Turnstile resetOn={state} onToken={setCaptchaToken} />
        {awaitingToken && (
          <p className={`${f.hint} ${s.captchaNote}`}>
            Just finishing the security check — one moment.
          </p>
        )}
      </div>
      {/* The case for sending this lives under the card now, in page.tsx's
          "What happens after you send this" — a reason list inside the form
          said the same things twice. */}
    </form>
    </>
  );
}
