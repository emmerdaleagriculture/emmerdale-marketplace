'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HOME_SERVICES } from '@/lib/home/services';
import { ViewOnce } from './Track';
import s from './home.module.css';

// window.gtag is declared once, in @/components/Analytics.

/**
 * The hero booking widget: pick the job, give a postcode, go.
 *
 * The brief's highest-leverage change. Previously every service card and CTA
 * pointed at a bare /start that had no idea what had been clicked, so the
 * customer described from scratch what they had already chosen.
 *
 * Navigates to /start with the service and postcode as query parameters.
 * /start's server component deliberately reads no searchParams — that is what
 * keeps it statically renderable — so LandingFlow picks these up client-side
 * after hydration.
 */

/** Outward district only: "SO24 9RX" → "SO24". */
export function outwardCode(postcode: string): string {
  const cleaned = postcode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return m ? m[1] : '';
}

export function QuoteWidget() {
  const router = useRouter();
  const [service, setService] = useState('');
  const [postcode, setPostcode] = useState('');
  const [locating, setLocating] = useState(false);

  const submit = () => {
    // LandingFlow already has a prefill contract — `job` fills the description,
    // `loc` fills the location, `src` marks an internal hand-off so an organic
    // arrival doesn't count as "(direct)" against the paid funnel. Reuse it
    // rather than inventing `service`/`postcode` params it would ignore.
    const chosen = HOME_SERVICES.find((x) => x.slug === service);
    const params = new URLSearchParams();
    // "other" deliberately prefills nothing: they said they'd describe it.
    if (chosen) params.set('job', chosen.name);
    if (postcode.trim()) params.set('loc', postcode.trim());
    params.set('src', 'home');

    // A funnel step, not an outcome — deliberately NOT marked a key event in
    // GA4, or the conversion rate flatters itself.
    //
    // postcode_area is the outward district and nothing finer. A full postcode
    // beside a job description is close enough to identifying a household that
    // it should never sit in an analytics property.
    window.gtag?.('event', 'start_quote', {
      service: service || '(none)',
      postcode_area: outwardCode(postcode) || '(none)',
      source: 'hero',
    });

    router.push(`/start?${params}`);
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    window.gtag?.('event', 'use_location', { source: 'hero' });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // postcodes.io reverse lookup — the same service the parse pipeline
          // already uses, so no new dependency and no key.
          const res = await fetch(
            `https://api.postcodes.io/postcodes?lon=${coords.longitude}&lat=${coords.latitude}&limit=1`,
            { signal: AbortSignal.timeout(6000) },
          );
          const json = (await res.json()) as { result?: { postcode?: string }[] | null };
          const found = json.result?.[0]?.postcode;
          if (found) setPostcode(found);
        } catch {
          /* a failed lookup just leaves the field for them to type in */
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <div className={s.widget}>
      {/* The denominator for the hero's conversion rate: how many arrivals
          actually got the widget on screen. */}
      <ViewOnce event="view_quote_widget" />
      <h2 className={s.widgetTitle}>What needs doing?</h2>
      <p className={s.widgetSub}>Takes about a minute. No account needed.</p>

      <div className={s.widgetField}>
        <label className={s.widgetLabel} htmlFor="qw-service">
          The job
        </label>
        <select
          id="qw-service"
          className={s.widgetSelect}
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">Choose a service…</option>
          {HOME_SERVICES.map((svc) => (
            <option key={svc.slug} value={svc.slug}>
              {svc.name}
            </option>
          ))}
          {/* An unmatched job is a first-class answer, not a dead end: the
              /start form takes free text either way. */}
          <option value="other">Something else — I&rsquo;ll describe it</option>
        </select>
      </div>

      <div className={s.widgetField}>
        <label className={s.widgetLabel} htmlFor="qw-postcode">
          Where
        </label>
        <div className={s.widgetRow}>
          <input
            id="qw-postcode"
            type="text"
            className={s.widgetInput}
            placeholder="Postcode, e.g. SO24 9RX"
            autoComplete="postal-code"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button type="button" className={s.widgetLocate} onClick={locate} disabled={locating}>
            {locating ? 'Locating…' : 'Locate'}
          </button>
        </div>
      </div>

      <button type="button" className={s.widgetGo} onClick={submit}>
        Get my prices
      </button>
      <p className={s.widgetReassure}>
        Free and no obligation — you&rsquo;re not booking anything yet.
      </p>
    </div>
  );
}
