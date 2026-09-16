'use client';

import { useEffect, useRef } from 'react';

// window.gtag is declared once, in @/components/Analytics.

/**
 * The homepage's GA4 events, per the brief's event spec.
 *
 * Two kinds. A "seen" event answers "does reaching this block predict
 * converting?" — the comparison and the recent-work board are the two
 * persuasion blocks worth knowing that about. A "click" event answers which
 * CTA earned the tap, which is the only way to tell whether the header, hero
 * or sticky bar is doing the work.
 *
 * None of these is a key event in GA4 except the ones Job 1 already handles.
 * start_quote in particular is a funnel step, not an outcome: marking it would
 * make the conversion rate look good while meaning nothing.
 */

type Params = Record<string, string | number>;

function send(event: string, params: Params = {}) {
  window.gtag?.('event', event, params);
}

/** Any CTA. `location` is what distinguishes them — header, hero, sticky, final. */
export function trackCta(location: string, params: Params = {}) {
  send('cta_click', { location, ...params });
}

/**
 * Fires once when the element scrolls into view, then disconnects.
 *
 * Once per pageload, not once per intersection: a visitor who scrolls up and
 * back down has not seen it twice, and counting it twice would quietly inflate
 * the denominator of every rate computed from it.
 */
export function ViewOnce({ event, params }: { event: string; params?: Params }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return;
    // No IntersectionObserver (or an old browser): count it as seen rather
    // than silently dropping the cohort from the numbers.
    if (!('IntersectionObserver' in window)) {
      fired.current = true;
      send(event, params);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || fired.current) return;
        fired.current = true;
        send(event, params);
        io.disconnect();
      },
      // A sliver on screen is not "seen" — ask for a quarter of it.
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
    // params is a literal at every call site; re-running on identity would
    // re-arm the observer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return <span ref={ref} aria-hidden="true" data-track={event} />;
}

/**
 * A link that reports an arbitrary event. For the CTAs whose event isn't
 * `cta_click` — the operator "Apply to join" being the one that matters, since
 * the supply side is currently invisible in the numbers entirely.
 */
export function TrackedLink({
  href,
  event,
  params,
  className,
  children,
}: {
  href: string;
  event: string;
  params?: Params;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => send(event, params)}>
      {children}
    </a>
  );
}

/** A CTA that reports where it was. */
export function CtaLink({
  href,
  location,
  className,
  children,
}: {
  href: string;
  location: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => trackCta(location)}>
      {children}
    </a>
  );
}
