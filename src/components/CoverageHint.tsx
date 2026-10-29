'use client';

import { useEffect, useState } from 'react';
import { coverageLine, looksLikePostcode, type CoverageAnswer } from '@/lib/coverageLine';

/**
 * "41 vetted contractors cover SO51 6FP." — the line under a postcode field.
 *
 * Of the people who reach the confirm page, most leave without touching it,
 * and the one thing the page never told them was whether anyone would
 * actually get their job. This answers that as soon as the postcode looks
 * complete, with the same count distribution uses (GET /api/coverage).
 *
 * Waits half a second after the last keystroke, and only asks once the
 * input is postcode-shaped, so a district typed letter by letter is one
 * request, not six. A stale answer never shows: each lookup is keyed to the
 * postcode it was for, and the line clears the moment the postcode changes.
 */
export function CoverageHint({
  postcode,
  service,
  className,
}: {
  postcode: string;
  /** A front-page card slug, so a services-only supplier counts when it is
   *  what was asked for. */
  service?: string | null;
  className?: string;
}) {
  const place = postcode.trim().toUpperCase();
  const [answer, setAnswer] = useState<{ place: string; result: CoverageAnswer } | null>(null);

  useEffect(() => {
    if (!looksLikePostcode(place)) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ postcode: place });
        if (service) params.set('service', service);
        const res = await fetch(`/api/coverage?${params}`, { signal: controller.signal });
        const result = (await res.json()) as CoverageAnswer;
        setAnswer({ place, result });
      } catch {
        /* an aborted or failed lookup leaves the line empty */
      }
    }, 500);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [place, service]);

  const line = answer && answer.place === place ? coverageLine(answer.result, place) : null;
  // Always a line's worth of space, filled or not. The answer lands well
  // after the keystroke that asked for it (half a second plus a lookup),
  // which is outside the window where a shift is forgiven as the user's own
  // doing, so it would otherwise count against the page as layout shift.
  return (
    <span className={className} style={{ display: 'block', minHeight: '1.25em' }} aria-live="polite">
      {line}
    </span>
  );
}
