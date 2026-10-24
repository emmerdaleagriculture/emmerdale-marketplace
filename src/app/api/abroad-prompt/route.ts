import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { countryFromHeader } from '@/lib/requestGeo';
import { PROMPT_LABEL_PREFIX } from '@/lib/abroadPrompt';

/**
 * POST /api/abroad-prompt — what happened to the outside-the-UK prompt
 * (components/abroad/AbroadPrompt): shown, dismissed, or one of its two
 * sign-up links taken. One row per event in page_events as a 'step' with
 * an abroad_prompt: label, the page it was on and the country Vercel saw,
 * read back on /admin/abroad. Same shape of endpoint as /api/track:
 * public, every field clamped, always 204.
 */

const EVENTS = new Set(['shown', 'dismissed', 'customer', 'contractor']);

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && site && !origin.startsWith(site.replace(/\/$/, ''))) {
    return new NextResponse(null, { status: 204 });
  }

  let body: { event?: unknown; path?: unknown; session?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const event = typeof body.event === 'string' && EVENTS.has(body.event) ? body.event : null;
  const path = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 120) : null;
  const session = typeof body.session === 'string' ? body.session.slice(0, 40) : '';
  if (!event || !path || !session) return new NextResponse(null, { status: 204 });

  try {
    const { error } = await createServiceRoleClient().from('page_events').insert({
      path,
      kind: 'step',
      session_key: session,
      label: `${PROMPT_LABEL_PREFIX}${event}`,
      country: countryFromHeader(request.headers.get('x-vercel-ip-country')),
    });
    if (error) console.error('[abroad-prompt] insert failed:', error.message);
  } catch (err) {
    console.error('[abroad-prompt] insert threw:', err);
  }
  return new NextResponse(null, { status: 204 });
}
