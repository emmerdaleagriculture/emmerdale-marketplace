import { NextResponse } from 'next/server';
import { coverageForPostcode } from '@/lib/coverageCount';

/**
 * GET /api/coverage?postcode=SO51+6FP&service=hedges — how many contractors a
 * job at that postcode would be sent to.
 *
 * Shown under every postcode field the moment the postcode looks complete.
 * Two of the three places this appears (the home page, /start) are static,
 * so the figure cannot be rendered in; it is one small request instead.
 *
 * Cached on the CDN for an hour per query string: a postcode's count moves
 * when a contractor is approved or lapses, which is daily at most, and the
 * lookup behind it is two network hops (postcodes.io, then the database).
 * Full postcodes are left in the URL rather than reduced to the outcode
 * because the radius is measured from the point, and a district can be
 * fifteen miles across.
 *
 * Nothing about the request is stored. It is a count, not a lead.
 */
export const dynamic = 'force-dynamic';

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postcode = (url.searchParams.get('postcode') ?? '').trim().slice(0, 12);
  const service = (url.searchParams.get('service') ?? '').trim().slice(0, 40) || null;
  if (!postcode) {
    return NextResponse.json({ ok: false, reason: 'shape' }, { status: 400 });
  }
  const answer = await coverageForPostcode(postcode, service);
  // A lookup failure is ours, not the postcode's: short-lived, so the next
  // visitor gets a fresh try rather than an hour of silence.
  const headers = {
    'Cache-Control': !answer.ok && answer.reason === 'lookup' ? 'public, s-maxage=60' : CACHE,
  };
  return NextResponse.json(answer, { headers });
}
