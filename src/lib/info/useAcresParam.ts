'use client';

import { useEffect } from 'react';
import { parseAcresParam } from './areaMaths';

/**
 * Fill a calculator's area from `?acres=`, the link the area map hands on.
 * Read from location in an effect rather than useSearchParams, so the Info
 * pages stay static (useSearchParams would need a Suspense boundary and
 * turn the page dynamic).
 */
export function useAcresParam(apply: (acres: string) => void) {
  useEffect(() => {
    const acres = parseAcresParam(new URLSearchParams(window.location.search).get('acres'));
    if (acres !== null) apply(String(acres));
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
