import { NextResponse } from 'next/server';
import { countryFromHeader } from '@/lib/requestGeo';

/**
 * GET /api/geo — the visitor's country as Vercel saw it, for client
 * components on cached pages. The notes and landing pages are rendered once
 * and served to everyone, so a server-side country check there would be the
 * first reader's country; this is one small uncached request instead. Two
 * letters and nothing else, never stored.
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const country = countryFromHeader(request.headers.get('x-vercel-ip-country'));
  return NextResponse.json({ country }, { headers: { 'Cache-Control': 'private, no-store' } });
}
