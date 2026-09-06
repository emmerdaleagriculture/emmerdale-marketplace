/**
 * A value loaded once and reused, with a time limit.
 *
 * Counties, services and the district→county map are 292 rows between them
 * and change roughly never, but every /start parse was re-reading them —
 * several database round trips on the one step the customer sits and watches.
 * Held in memory they cost nothing, and Fluid Compute reuses an instance
 * across requests so the cache actually survives to be used.
 *
 * The in-flight promise is shared, so a burst of arrivals triggers one load
 * rather than one each. A failed load is not cached: the next caller retries
 * instead of inheriting the error for the rest of the TTL.
 */
export function memoize<T>(load: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: Promise<T> | null = null;
  let expires = 0;

  return () => {
    if (value && Date.now() < expires) return value;
    expires = Date.now() + ttlMs;
    value = load().catch((err) => {
      value = null;
      expires = 0;
      throw err;
    });
    return value;
  };
}

/** Reference data: rare, deliberate changes; a redeploy clears it anyway. */
export const REFERENCE_TTL_MS = 10 * 60 * 1000;
