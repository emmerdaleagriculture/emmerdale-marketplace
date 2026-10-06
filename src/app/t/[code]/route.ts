import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';

/**
 * GET /t/<code> — the short link in a text message. Counts the tap against
 * the text (pending_sms.clicked_at / clicks, migration 20261006190000) and
 * forwards to the page the text is about. An unknown code goes to the home
 * page rather than a 404: it came from a text we sent, so it is ours to land.
 */

export const dynamic = 'force-dynamic';

/**
 * Link-preview fetchers. A phone or app that draws a preview card fetches the
 * link without anyone tapping it; counting those would make every text look
 * tapped.
 */
const PREVIEW_BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|curl|wget|python|headless/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = siteUrl();
  if (!/^[A-Za-z0-9]{7}$/.test(code)) return NextResponse.redirect(home, 302);

  const count = !PREVIEW_BOT.test(req.headers.get('user-agent') ?? '');
  const { data, error } = await createServiceRoleClient().rpc('sms_link_hit', { p_code: code, p_count: count });
  if (error) console.error('[t] sms_link_hit failed:', error.message);

  return NextResponse.redirect(ours(data, home) ? data : home, 302);
}

/** Only ever forward to this site (www or bare), whatever the row says. */
function ours(link: unknown, home: string): link is string {
  if (typeof link !== 'string') return false;
  try {
    const bare = (h: string) => h.replace(/^www\./, '');
    return bare(new URL(link).hostname) === bare(new URL(home).hostname);
  } catch {
    return false;
  }
}
