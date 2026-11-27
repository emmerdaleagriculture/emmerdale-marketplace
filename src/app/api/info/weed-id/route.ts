import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { membershipOf } from '@/lib/membership';
import { identifyWeed, type WeedIdMedia } from '@/lib/info/weedId';
import { WEEDS } from '@/lib/info/weeds';

export const maxDuration = 120;

/**
 * Info › Name that weed, by photograph. For Pro and Premium members (the
 * user's decision, 2026-11-27): each photo is a paid AI call. GET says
 * whether the viewer may use it and how many they have left today; POST
 * takes one photo (form field `photo`) and answers with the weed.
 *
 * The photo is read and thrown away. weed_id_events keeps the answer and the
 * cost, and is what the daily allowance is counted from.
 */
const PER_DAY = 20;
const MAX_BYTES = 4 * 1024 * 1024;
const MEDIA: WeedIdMedia[] = ['image/jpeg', 'image/png', 'image/webp'];

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

type Access = { ok: true; userId: string; left: number } | { ok: false; reason: 'signed-out' | 'not-member' | 'used-up' };

async function access(): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed-out' };
  const admin = createServiceRoleClient();
  const [{ data: contractor }, { data: sub }] = await Promise.all([
    admin.from('contractors').select('status, premium_comped_until, open_comped_until').eq('id', user.id).maybeSingle(),
    admin.from('subscriptions').select('status, tier').eq('contractor_id', user.id).maybeSingle(),
  ]);
  if (!contractor || contractor.status !== 'approved' || !membershipOf(sub, contractor)) return { ok: false, reason: 'not-member' };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('weed_id_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  const left = PER_DAY - (count ?? 0);
  return left > 0 ? { ok: true, userId: user.id, left } : { ok: false, reason: 'used-up' };
}

export async function GET() {
  const a = await access();
  return json(200, a.ok ? { can: true, left: a.left } : { can: false, reason: a.reason });
}

export async function POST(request: Request) {
  const a = await access();
  if (!a.ok) {
    return a.reason === 'used-up'
      ? json(429, { error: `That is ${PER_DAY} photos in a day. More tomorrow, or pick the weed from the list.` })
      : json(403, { error: a.reason === 'signed-out' ? 'Sign in first.' : 'Photo identification is for Pro and Premium members.' });
  }
  const form = await request.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!(photo instanceof File)) return json(400, { error: 'No photo arrived. Try again.' });
  if (!MEDIA.includes(photo.type as WeedIdMedia)) return json(400, { error: 'Send a JPEG, PNG or WebP photo.' });
  if (photo.size > MAX_BYTES) return json(400, { error: 'That photo is too large. Try again with a smaller one.' });
  // A blank frame from a phone that ran short of memory (see photoDownscale.ts).
  if (photo.size < 1024) return json(400, { error: 'That photo came through blank. Take it again.' });

  const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64');
  const result = await identifyWeed(base64, photo.type as WeedIdMedia, WEEDS.map((w) => ({ slug: w.slug, name: w.name, latin: w.latin })));

  const admin = createServiceRoleClient();
  const { error: logError } = await admin.from('weed_id_events').insert({
    user_id: a.userId,
    weed_slug: result.answer?.slug ?? null,
    answer_name: result.answer?.name ?? null,
    confidence: result.answer ? Math.round(result.answer.confidence * 100) / 100 : null,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: Math.round(result.costUsd * 100000) / 100000,
    error: result.error,
  });
  if (logError) console.error('[weed-id] log failed:', logError.message);

  if (!result.answer) return json(502, { error: result.error ?? 'The photo couldn’t be read.' });
  return json(200, { answer: result.answer, left: a.left - 1 });
}
