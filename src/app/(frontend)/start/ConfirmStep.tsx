'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { confirmJobAction, type ConfirmActionState } from './actions';
import type { ParseResult } from '@/lib/jobParse/schema';
import { conditionsFor, isAreaPriced } from '@/lib/jobParse/conditions';
import { GATE_WIDTH_OPTIONS } from '@/lib/jobParse/access';
import { areaDiscrepancy } from '@/lib/jobParse/geometry';
import { BoundaryMap, type BoundaryState } from './BoundaryMap';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';
import s from './start.module.css';

const EMPTY: ConfirmActionState = {};

/**
 * Steps 3–4: the parse result as editable fields, then contact details, one
 * form. The editing is the accuracy mechanism, not a formality — nothing
 * downstream treats unconfirmed parse output as reliable.
 *
 * Service confirmation rules (spec §4): a suggested service is restated in
 * plain English with Yes / Not quite; "not quite" reveals the alternatives
 * plus a describe-it-yourself fallback; an unmatched parse skips straight to
 * the alternatives (we never present a guess the model declined to make);
 * and no choice here ever blocks submission.
 *
 * Area verification (§7): a draggable pin and a boundary drawn on satellite
 * imagery. Drawing is required for area-priced services — but only while the
 * map actually works; any imagery failure lifts the requirement rather than
 * dead-ending the page (§6.4). Stated-vs-drawn discrepancies over the
 * threshold raise a non-blocking flag; both figures are stored regardless.
 */
export function ConfirmStep({ result }: { result: ParseResult }) {
  const [state, action, pending] = useActionState(confirmJobAction, EMPTY);
  const [view, setView] = useState<'suggested' | 'accepted' | 'alternatives'>(
    result.service ? 'suggested' : 'alternatives',
  );
  const [choice, setChoice] = useState<string>(result.service ?? '');
  const [otherOpen, setOtherOpen] = useState(false);
  const [areaValue, setAreaValue] = useState(result.area_value?.toString() ?? '');
  const [conditionValues, setConditionValues] = useState<Record<string, string>>({});
  const [mapState, setMapState] = useState<BoundaryState | null>(null);
  const [mapStatus, setMapStatus] = useState<'pending' | 'ready' | 'unavailable'>('pending');
  const [keepStated, setKeepStated] = useState(false);
  const [gateWidth, setGateWidth] = useState('');
  // Boundary nudge: pressing Send without a boundary scrolls to the map and
  // asks for one, once. The customer can still send without it.
  const [drawRequest, setDrawRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const sendWithoutBoundary = useRef(false);

  // Step changes are state swaps, not navigations — the browser keeps the
  // old scroll position, leaving the customer mid-page. Reset on mount (the
  // confirm step appearing) and again when the success card replaces it.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    if (state.ok || state.error) window.scrollTo({ top: 0 });
  }, [state]);

  const missing = (k: string) => result.missing_fields.includes(k);
  const low = (k: string) => (result.parse_confidence[k] ?? 0) < 0.6;
  const fieldClass = (k: string) => (missing(k) || low(k) ? `${f.field} ${s.flagged}` : f.field);

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  const accepted = view === 'accepted';
  // The service the customer currently stands behind — null means "their own
  // words" (stored as unmatched).
  const currentService = otherOpen ? null : choice || null;
  const questions = conditionsFor(currentService);

  const statedAcres = Number(areaValue) > 0 ? Number(areaValue) : null;
  const mappedAcres = mapState?.mappedAcres ?? null;
  const showDiscrepancy = !keepStated && areaDiscrepancy(statedAcres, mappedAcres);

  // §7: boundary drawing is expected for area-priced services — while the
  // map is actually usable. An unavailable map never blocks. It is a nudge,
  // not a gate: a disabled Send button reads as "nothing happened" (a live
  // customer reported exactly that), so the first press without a boundary
  // scrolls to the map and asks; the customer can then draw, or send anyway.
  const boundaryWanted =
    isAreaPriced(currentService) &&
    mapStatus === 'ready' &&
    result.lat !== null &&
    !mapState?.boundary;
  const nudged = drawRequest > 0 && boundaryWanted;

  return (
    <form
      ref={formRef}
      action={action}
      className={a.card}
      onSubmit={(e) => {
        if (boundaryWanted && !sendWithoutBoundary.current) {
          e.preventDefault();
          setDrawRequest((n) => n + 1);
        }
      }}
    >
      {/* Tiles come from Mapbox the moment the map mounts — start the TLS
          handshake now. React hoists this into <head>. */}
      {result.lat !== null && <link rel="preconnect" href="https://api.mapbox.com" />}
      {state.error && <p className={f.error}>{state.error}</p>}

      <input type="hidden" name="submission_id" value={result.submission_id} />
      <input type="hidden" name="service_choice" value={otherOpen ? 'other' : choice || 'other'} />
      <input type="hidden" name="service_confirmed" value={accepted ? 'yes' : 'no'} />
      {/* Pin coords are submitted only once the customer has actually touched
          the map — an untouched pin is just the parse-time geocode, and it
          must not override a postcode corrected on this page. */}
      <input type="hidden" name="lat" value={mapState?.lat ?? ''} />
      <input type="hidden" name="lng" value={mapState?.lng ?? ''} />
      <input
        type="hidden"
        name="boundary"
        value={mapState?.boundary ? JSON.stringify(mapState.boundary) : ''}
      />
      {Object.entries(conditionValues).map(([k, v]) => (
        <input key={k} type="hidden" name={`condition_${k}`} value={v} />
      ))}

      {/* ── The service ──────────────────────────────────────────────── */}
      {view === 'suggested' && result.service && (
        <div className={s.serviceBlock}>
          <p className={s.servicePrompt}>
            Sounds like you need <strong>{result.service}</strong>. Is that right?
          </p>
          <div className={s.serviceButtons}>
            <button
              type="button"
              className={f.btnPrimary}
              onClick={() => {
                setChoice(result.service!);
                setView('accepted');
              }}
            >
              Yes, that&rsquo;s it
            </button>
            <button type="button" className={f.btnGhost} onClick={() => setView('alternatives')}>
              Not quite
            </button>
          </div>
        </div>
      )}

      {accepted && (
        <div className={s.serviceBlock}>
          <p className={s.servicePrompt}>
            <strong>{choice}</strong> it is.{' '}
            <button type="button" className={s.linkButton} onClick={() => setView('alternatives')}>
              Change
            </button>
          </p>
        </div>
      )}

      {view === 'alternatives' && (
        <div className={s.serviceBlock}>
          <p className={s.servicePrompt}>
            {result.service_alternatives.length
              ? 'Which of these is closest?'
              : 'Tell us about the work in your own words below.'}
          </p>
          {result.service_alternatives.length > 0 && (
            <div className={f.chips}>
              {result.service_alternatives.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={choice === name && !otherOpen ? `${f.chip} ${f.chipOn}` : f.chip}
                  onClick={() => {
                    setChoice(name);
                    setOtherOpen(false);
                  }}
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                className={otherOpen ? `${f.chip} ${f.chipOn}` : f.chip}
                onClick={() => setOtherOpen(true)}
              >
                Something else
              </button>
            </div>
          )}
          {(otherOpen || result.service_alternatives.length === 0) && (
            <label className={f.field}>
              <span className={f.label}>Describe it in your own words</span>
              <input
                className={f.input}
                type="text"
                name="service_other_text"
                maxLength={300}
                defaultValue={result.service_verbatim}
              />
            </label>
          )}
        </div>
      )}

      {/* ── Condition questions (spec §26a.2) ────────────────────────── */}
      {questions.length > 0 && (
        <div className={s.serviceBlock}>
          {questions.map((q) => (
            <div key={q.key} className={f.field}>
              <span className={f.label}>{q.label}</span>
              <div className={f.chips}>
                {q.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={
                      conditionValues[q.key] === o.value ? `${f.chip} ${f.chipOn}` : f.chip
                    }
                    onClick={() =>
                      setConditionValues((prev) => ({ ...prev, [q.key]: o.value }))
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── The details ──────────────────────────────────────────────── */}
      <div className={a.groupTitle}>Check the details</div>

      <div className={a.row2}>
        <label className={fieldClass('area')}>
          <span className={f.label}>How much ground?</span>
          {/* Never `required`: for an unmatched job (a roof, a barn) there is
              no sensible answer, and a blocked submit is a lost lead — capture
              beats completeness (spec §4 step 3). The flag styling still asks. */}
          <input
            className={f.input}
            type="number"
            name="area_value"
            inputMode="decimal"
            step="any"
            min="0"
            value={areaValue}
            onChange={(e) => setAreaValue(e.target.value)}
          />
        </label>
        <label className={fieldClass('area')}>
          <span className={f.label}>Unit</span>
          <select className={f.input} name="area_unit" defaultValue={result.area_unit ?? 'acres'}>
            <option value="acres">acres</option>
            <option value="hectares">hectares</option>
            <option value="sq_m">square metres</option>
            <option value="linear_m">metres (hedges &amp; ditches)</option>
          </select>
        </label>
      </div>

      {/* ── Map pin + boundary (spec §7) ─────────────────────────────── */}
      {result.lat !== null && result.lng !== null && (
        <BoundaryMap
          lat={result.lat}
          lng={result.lng}
          onChange={setMapState}
          onStatus={setMapStatus}
          drawRequest={drawRequest}
        />
      )}

      {nudged && (
        <div className={s.discrepancy} role="alert">
          <p className={s.servicePrompt}>
            <strong>One more thing before we send it:</strong> tap the corners of the
            area on the map above, one by one, so contractors can see exactly what
            they&rsquo;re quoting for. Then press <strong>Send my job</strong> again.
          </p>
          <div className={s.serviceButtons}>
            <button
              type="button"
              className={f.btnGhost}
              onClick={() => {
                sendWithoutBoundary.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              I can&rsquo;t draw it, send anyway
            </button>
          </div>
        </div>
      )}

      {showDiscrepancy && (
        <div className={s.discrepancy}>
          <p className={s.servicePrompt}>
            You said <strong>{statedAcres} acres</strong>, but the boundary you drew
            measures about <strong>{mappedAcres} acres</strong>. Which is right?
          </p>
          <div className={s.serviceButtons}>
            <button
              type="button"
              className={f.btnPrimary}
              onClick={() => setAreaValue(String(mappedAcres))}
            >
              Use {mappedAcres} acres
            </button>
            <button type="button" className={f.btnGhost} onClick={() => setKeepStated(true)}>
              Keep {statedAcres}
            </button>
          </div>
        </div>
      )}

      <label className={fieldClass('location')}>
        <span className={f.label}>Postcode</span>
        <input
          className={f.input}
          type="text"
          name="postcode"
          autoComplete="postal-code"
          required={missing('location')}
          defaultValue={result.postcode ?? ''}
        />
        {result.county_name && <span className={f.hint}>We make that {result.county_name}.</span>}
      </label>

      <div className={a.row2}>
        <label className={fieldClass('urgency')}>
          <span className={f.label}>When&rsquo;s it needed?</span>
          <select
            className={f.input}
            name="urgency"
            required={missing('urgency')}
            defaultValue={result.urgency ?? ''}
          >
            <option value="" disabled>
              Choose…
            </option>
            <option value="asap">As soon as possible</option>
            <option value="within_month">Within the month</option>
            <option value="flexible">I&rsquo;m flexible</option>
            <option value="dated">By a specific date</option>
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>Date (if you have one)</span>
          <input
            className={f.input}
            type="date"
            name="target_date"
            defaultValue={result.target_date ?? ''}
          />
        </label>
      </div>

      {/* Gate / access: the contractor's first question is "does the machine
          fit", and a what3words square finds the gate down an unnamed track. */}
      <div className={f.field}>
        <span className={f.label}>How wide is the gate or entrance? (optional)</span>
        <input type="hidden" name="gate_width" value={gateWidth} />
        <div className={f.chips}>
          {GATE_WIDTH_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={gateWidth === o.value ? `${f.chip} ${f.chipOn}` : f.chip}
              onClick={() => setGateWidth(gateWidth === o.value ? '' : o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <label className={f.field}>
        <span className={f.label}>what3words for the gate (optional)</span>
        <input
          className={f.input}
          type="text"
          name="gate_w3w"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={60}
          placeholder="e.g. filled.count.soap"
        />
        <span className={f.hint}>
          The three words for the entrance itself — from the what3words app.
        </span>
      </label>

      <label className={f.field}>
        <span className={f.label}>Getting machinery in (optional)</span>
        <textarea
          className={f.textarea}
          name="access_notes"
          rows={2}
          maxLength={1000}
          placeholder="Gates, narrow lanes, anything a tractor needs to know about"
          defaultValue={result.access_notes}
        />
      </label>

      <label className={f.field}>
        <span className={f.label}>Anything in the way? (optional)</span>
        <textarea
          className={f.textarea}
          name="obstacles"
          rows={2}
          maxLength={1000}
          placeholder="Trees, fences, wet ground, livestock…"
          defaultValue={result.obstacles}
        />
      </label>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <div className={a.groupTitle}>Where should contractors reach you?</div>

      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Your name</span>
          <input className={f.input} type="text" name="contact_name" required autoComplete="name" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} type="tel" name="contact_phone" required autoComplete="tel" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Email</span>
          <input className={f.input} type="email" name="contact_email" required autoComplete="email" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Best way to reach you</span>
          <select className={f.input} name="contact_preference" defaultValue="either">
            <option value="either">Phone or email</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
          </select>
        </label>
      </div>

      <div className={a.actions}>
        {boundaryWanted && (
          <p className={f.hint}>
            {nudged
              ? 'Trace round the area on the map above, then press Send again.'
              : 'Tip: tracing round the area on the map gets you straighter quotes.'}
          </p>
        )}
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send my job'}
        </button>
      </div>
    </form>
  );
}
