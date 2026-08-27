import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Abuse controls for the /start parse flow (spec §8): per-IP rate limits and
 * a global daily LLM budget, both counted from job_parse_events — which
 * doubles as the rejection log, so tuning is done from recorded data.
 *
 * Postgres is the counter on purpose (no Redis in this stack); at 5 parses
 * per IP per hour an indexed count is nowhere near a bottleneck.
 */

export const PARSE_LIMIT_PER_HOUR = Number(process.env.PARSE_RATE_LIMIT_PER_HOUR || 5);
export const CONFIRM_LIMIT_PER_HOUR = 20;
export const PARSE_DAILY_CAP = Number(process.env.PARSE_DAILY_CAP || 500);

/** First hop of x-forwarded-for — the client IP on Vercel. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

export type ParseEventAction = 'parse' | 'confirm';
export type ParseEventOutcome = 'ok' | 'rejected' | 'fallback';

/** Append to the event log. Never throws — logging must not break the flow. */
export async function logParseEvent(
  ip: string,
  action: ParseEventAction,
  outcome: ParseEventOutcome,
  reason?: string,
): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from('job_parse_events').insert({ ip, action, outcome, reason: reason ?? null });
  } catch (err) {
    console.error('[jobParse] event log insert failed:', err);
  }
}

/**
 * True when this IP is over its hourly limit for the action. Fails open on a
 * counting error — the limit protects spend, it must not cost conversions.
 */
export async function rateLimited(
  ip: string,
  action: ParseEventAction,
  limitPerHour: number,
): Promise<boolean> {
  if (ip === 'unknown') return false; // never lump all unknown traffic into one bucket
  try {
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from('job_parse_events')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('action', action)
      .gte('created_at', since);
    if (error) throw error;
    return (count ?? 0) >= limitPerHour;
  } catch (err) {
    console.error('[jobParse] rate-limit check failed — failing open:', err);
    return false;
  }
}

/**
 * Global backstop on LLM spend: once the day's successful parses hit the cap,
 * later submissions get the deterministic pipeline only. Degrades, never
 * rejects. (The hard ceiling on the Anthropic key in the console is separate
 * and operational.)
 */
export async function dailyParseBudgetExceeded(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from('job_parse_events')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'parse')
      .eq('outcome', 'ok')
      .gte('created_at', since);
    if (error) throw error;
    return (count ?? 0) >= PARSE_DAILY_CAP;
  } catch (err) {
    console.error('[jobParse] daily budget check failed — failing open:', err);
    return false;
  }
}
