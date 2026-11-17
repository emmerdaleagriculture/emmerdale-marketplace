import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';

/**
 * GET /go/pro/<offer id> is the link in the Pro offer email (sq_pro_offer).
 * It counts the tap against that send (contractor_pro_offers.clicked_at /
 * clicks) and forwards to the membership page, so the email can be judged
 * on its own taps and not just on sales.
 *
 * It sits outside /account on purpose. The apps claim /account*, and the
 * membership page sells through Stripe, which the app may not do, so this
 * link has to open in the browser.
 */

export const dynamic = 'force-dynamic';

/** Link-preview fetchers and scanners shouldn't count as taps. Same list as /t/[code]. */
const PREVIEW_BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|curl|wget|python|headless/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = `${siteUrl()}/account/membership`;
  if (UUID.test(id)) {
    const count = !PREVIEW_BOT.test(req.headers.get('user-agent') ?? '');
    const { error } = await createServiceRoleClient().rpc('pro_offer_link_hit', { p_id: id, p_count: count });
    if (error) console.error('[go/pro] pro_offer_link_hit failed:', error.message);
  }
  return NextResponse.redirect(target, 302);
}

/**
 * Some mail scanners send HEAD before anyone taps. Without this, Next answers
 * HEAD by running GET, and the scan would count as a tap.
 */
export function HEAD() {
  return NextResponse.redirect(`${siteUrl()}/account/membership`, 302);
}
