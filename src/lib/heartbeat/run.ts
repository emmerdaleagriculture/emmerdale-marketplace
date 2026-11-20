import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runChecks, type CheckResult } from './checks';

export type HeartbeatRow = { check_name: string; ok: boolean; detail: string | null; checked_at: string; ms: number | null; lastOk: string | null };

/**
 * Run every check, keep the results, and tell Sentry about any check that
 * has just gone from ok to not ok (once per change, not every 15 minutes,
 * so a broken thing is one alert and not a hundred). It then shows in the
 * Unhandled list on /admin/errors as well as in the Heartbeat table.
 */
export async function runHeartbeat(): Promise<{ checks: number; failing: string[] }> {
  const admin = createServiceRoleClient();
  const results = await runChecks();
  const before = await latest();
  const runId = randomUUID();
  const { error } = await admin
    .from('heartbeat_results')
    .insert(results.map((r) => ({ run_id: runId, check_name: r.name, ok: r.ok, detail: r.detail, ms: r.ms })));
  if (error) console.error('[heartbeat] could not save results:', error.message);

  for (const r of results) {
    const prev = before.get(r.name);
    if (!r.ok && (!prev || prev.ok)) alert(r);
  }
  await admin.from('heartbeat_results').delete().lt('checked_at', new Date(Date.now() - 14 * 24 * 3600_000).toISOString());
  return { checks: results.length, failing: results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`) };
}

function alert(r: CheckResult) {
  Sentry.captureMessage(`Heartbeat: ${r.name} failing`, {
    level: 'error',
    fingerprint: ['heartbeat', r.name],
    tags: { area: 'heartbeat', check: r.name },
    extra: { detail: r.detail },
  });
}

/** The newest result for every check, with when it was last ok. */
export async function latest(): Promise<Map<string, HeartbeatRow>> {
  const admin = createServiceRoleClient();
  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  const { data, error } = await admin
    .from('heartbeat_results')
    .select('check_name, ok, detail, checked_at, ms')
    .gt('checked_at', since)
    .order('checked_at', { ascending: false })
    .limit(1000);
  const out = new Map<string, HeartbeatRow>();
  // Never take the errors page down with it: an unreadable table shows as
  // "not run yet", and the cron's own row on /admin/crons still tells the truth.
  if (error) {
    console.error('[heartbeat] could not read heartbeat_results:', error.message);
    return out;
  }
  for (const r of data ?? []) {
    const cur = out.get(r.check_name);
    if (!cur) out.set(r.check_name, { ...r, lastOk: r.ok ? r.checked_at : null });
    else if (!cur.lastOk && r.ok) cur.lastOk = r.checked_at;
  }
  return out;
}
