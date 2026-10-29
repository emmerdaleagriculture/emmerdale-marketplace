/**
 * The one sentence under a postcode field: how many contractors would be
 * invited to a job there.
 *
 * Client-safe on purpose — the hint component imports it, so nothing here
 * may touch Supabase or postcodes.io. The figure itself comes from
 * GET /api/coverage, which runs the same count distribute_submission uses.
 */

/**
 * The shape the route accepts: a UK outward code on its own ("SO51") or a
 * full postcode ("SO51 6FP"), any case, any spacing. Looser than the
 * server's normaliser — it lets the server try the 0/O swaps — but tight
 * enough that a half-typed "SO" never fires a lookup.
 */
const SHAPE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;

export function looksLikePostcode(raw: string): boolean {
  return SHAPE.test(raw.trim());
}

export type CoverageAnswer =
  | { ok: true; count: number; county: string; outcode: string }
  | { ok: false; reason: 'shape' | 'unknown' | 'border' | 'lookup' };

/**
 * `place` is what the customer typed, trimmed and upper-cased — "SO51 6FP"
 * reads back as theirs, where the outcode alone ("SO51") reads like we have
 * rounded them off to a district.
 */
export function coverageLine(answer: CoverageAnswer, place: string): string | null {
  if (!answer.ok) {
    // A border postcode still has contractors; the confirm page asks which
    // side. Nothing to say yet rather than something wrong.
    if (answer.reason === 'border') return null;
    if (answer.reason === 'unknown') return 'We can’t place that postcode. Check it and try again.';
    return null;
  }
  const where = place || answer.outcode;
  if (answer.count === 0) {
    return `We don’t have a contractor near ${where} yet. Send the job anyway and we’ll look for one.`;
  }
  if (answer.count === 1) return `1 vetted contractor covers ${where}.`;
  return `${answer.count} vetted contractors cover ${where}.`;
}
