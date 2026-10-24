// Edge Function: the probe detector (Layer 1 of the security system).
//
// Every 15 minutes pg_cron posts here (probe_detector_tick()). The function
// reads the last 30 minutes of API-gateway logs through the Supabase
// Analytics API, aggregates them per (IP, JA4, user agent), scores
// enumeration, injection, admin-probing and storage-abuse signals, clusters
// the survivors by TLS fingerprint so a spray reads as one actor, and writes
// one security_probe_events row per IP plus one deduped security_anomalies
// card per cluster. A critical card reaches the admin by email within the
// hour (security_critical_email_tick); the rest wait for the 07:00 digest.
//
// A heartbeat is merged into app_config.probe_detector_state on every live
// firing so the hourly watchdog (detect_probe_detector_gap) can tell "nothing
// scanned us" from "the detector stopped". A manual backfill, POSTed as
// {"window_start","window_end"} at most 24 h apart, scores a span without
// touching the heartbeat and marks its rows backfill=true.
//
// Gate: x-cron-secret (the same CRON_SECRET send-emails uses) or the service
// role key as a bearer. verify_jwt is off in config.toml because the anon key
// passing that gate is not authorisation; the function checks the caller
// itself and answers 403 to anyone else.
//
// What this cannot do: block anyone. Scanners hit <ref>.supabase.co directly,
// which is Supabase's edge, not ours. The real defence is RLS and the RPC
// caller guards the weekly Layer 0 audit checks; this is how we learn we were
// scanned and whether anything was touched.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildUrl, coerceRow, parseAnalyticsTime, type ActorRow } from './query.ts';
import { scoreActors, type Cluster } from './scorer.ts';
import { computeWindow, parseBackfill, type DetectorState, type Window } from './window.ts';

const STATE_KEY = 'probe_detector_state';
/** A probe_scan card for the same cluster within this many hours is updated, not duplicated. */
const CLUSTER_DEDUPE_HOURS = 6;

type Json = Record<string, unknown>;

function authorised(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const given = req.headers.get('x-cron-secret');
  if (cronSecret && given === cronSecret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (serviceKey && bearer === serviceKey) return true;
  return false;
}

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

type Supabase = ReturnType<typeof serviceClient>;

async function mgmtToken(supabase: Supabase): Promise<string | null> {
  const env = Deno.env.get('MGMT_API_TOKEN');
  if (env) return env;
  const { data, error } = await supabase.rpc('get_mgmt_token');
  if (error) console.error('[detect-probe-activity] get_mgmt_token:', error.message);
  return typeof data === 'string' && data ? data : null;
}

async function readState(supabase: Supabase): Promise<DetectorState | null> {
  const { data } = await supabase.from('app_config').select('value').eq('key', STATE_KEY).maybeSingle();
  const v = data?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as DetectorState) : null;
}

/** Server-side JSON merge: an overlapping firing can never drop a field it did not write. */
async function heartbeat(supabase: Supabase, patch: Json): Promise<void> {
  const { error } = await supabase.rpc('probe_detector_state_merge', { p_patch: patch });
  if (error) console.error('[detect-probe-activity] heartbeat:', error.message);
}

type Fetched = { ok: true; rows: ActorRow[]; url: string } | { ok: false; status: number; detail: string; url: string };

/** One retry, after 2 s, on a 5xx or a dropped connection only. A 400/401/414 is final. */
async function fetchActors(token: string, w: Window): Promise<Fetched> {
  const url = buildUrl(w.start, w.end);
  let last: Fetched | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const text = await res.text();
      if (!res.ok) {
        last = { ok: false, status: res.status, detail: text.slice(0, 300), url };
        if (res.status >= 500) continue;
        return last;
      }
      let body: { result?: unknown; error?: unknown };
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, status: res.status, detail: `not JSON: ${text.slice(0, 200)}`, url };
      }
      // The endpoint answers 200 with {"error": "..."} for a bad query.
      if (body.error) return { ok: false, status: 200, detail: String(body.error).slice(0, 300), url };
      const result = Array.isArray(body.result) ? body.result : [];
      return { ok: true, rows: result.map((r) => coerceRow(r as Record<string, unknown>)), url };
    } catch (err) {
      last = { ok: false, status: 0, detail: `fetch failed: ${err instanceof Error ? err.message : String(err)}`, url };
    }
  }
  return last ?? { ok: false, status: 0, detail: 'no attempt made', url };
}

async function allowlist(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase.from('security_probe_allowlist').select('cidr');
  if (error) console.error('[detect-probe-activity] allowlist:', error.message);
  return (data ?? []).map((r) => String(r.cidr));
}

async function persist(
  supabase: Supabase,
  clusters: Cluster[],
  firingId: string,
  w: Window,
  backfill: boolean,
): Promise<{ events: number; anomalies: number; errors: string[] }> {
  const errors: string[] = [];
  let events = 0;
  let anomalies = 0;
  for (const c of clusters) {
    const rows = c.actors.map((a) => ({
      firing_id: firingId,
      window_start: w.start.toISOString(),
      window_end: w.end.toISOString(),
      cluster_key: c.key,
      cluster_label: c.label,
      cluster_score: c.score,
      severity: c.severity,
      actor_ip: a.ip,
      asn_org: a.asn_org || null,
      country: a.country || null,
      ja4: a.ja4 || null,
      user_agent: a.ua || null,
      requests: a.total,
      ip_score: a.score,
      signals: a.signals,
      top_paths: a.sample_paths,
      first_seen: a.first_seen ? parseAnalyticsTime(a.first_seen).toISOString() : null,
      last_seen: a.last_seen ? parseAnalyticsTime(a.last_seen).toISOString() : null,
      check_flag: a.write2xx > 0,
      backfill,
    }));
    const ins = await supabase.from('security_probe_events').insert(rows);
    if (ins.error) errors.push(`events ${c.key}: ${ins.error.message}`);
    else events += rows.length;

    const raise = await supabase.rpc('security_anomaly_raise', {
      p_stream: 'security_probe',
      p_rule: 'probe_scan',
      p_severity: c.severity,
      p_message: backfill ? `${c.message} [backfill]` : c.message,
      p_cluster_key: c.key,
      p_dedupe_hours: CLUSTER_DEDUPE_HOURS,
    });
    if (raise.error) errors.push(`anomaly ${c.key}: ${raise.error.message}`);
    else anomalies++;
  }
  return { events, anomalies, errors };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 });
  if (!authorised(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const backfill = parseBackfill(body);
  if (backfill && 'error' in backfill) return Response.json({ error: backfill.error }, { status: 400 });

  const supabase = serviceClient();
  const now = new Date();
  const state = backfill ? null : await readState(supabase);
  const w: Window = backfill
    ? { start: backfill.start, end: backfill.end, catchingUp: false, unscored: null }
    : computeWindow(now, state);
  const live = !backfill;

  const token = await mgmtToken(supabase);
  if (!token) {
    const detail = 'no MGMT_API_TOKEN secret and no supabase_mgmt_token in Vault';
    if (live) {
      await heartbeat(supabase, {
        last_failure_at: now.toISOString(),
        last_failure_detail: detail,
        consecutive_failures: ((state as Json | null)?.consecutive_failures as number ?? 0) + 1,
      });
    }
    return Response.json({ error: detail }, { status: 500 });
  }

  const [fetched, cidrs] = await Promise.all([fetchActors(token, w), allowlist(supabase)]);

  if (!fetched.ok) {
    if (live) {
      const prev = (state as Json | null) ?? {};
      await heartbeat(supabase, {
        last_failure_at: now.toISOString(),
        last_failure_detail: `HTTP ${fetched.status}: ${fetched.detail}`.slice(0, 300),
        consecutive_failures: ((prev.consecutive_failures as number) ?? 0) + 1,
        ...(w.catchingUp ? { catchup_failures: ((prev.catchup_failures as number) ?? 0) + 1 } : {}),
      });
    }
    console.error('[detect-probe-activity] analytics failed:', fetched.status, fetched.detail);
    return Response.json(
      { error: 'analytics query failed', status: fetched.status, detail: fetched.detail, url_bytes: fetched.url.length },
      { status: 502 },
    );
  }

  const clusters = scoreActors(fetched.rows, { allowlistCidrs: cidrs, parseTime: parseAnalyticsTime });
  const firingId = crypto.randomUUID();
  const saved = await persist(supabase, clusters, firingId, w, !live);

  // A span this firing could not reach: say exactly which, so it can be
  // backfilled by hand. One open card, updated rather than duplicated.
  if (live && w.unscored) {
    const r = await supabase.rpc('security_anomaly_raise', {
      p_stream: 'security_probe',
      p_rule: 'probe_detector_unscored',
      p_severity: 'warning',
      p_message:
        `The detector could not score ${w.unscored.start.toISOString()} to ${w.unscored.end.toISOString()}. ` +
        `Backfill it from Admin > Security (at most 24 h per window).`,
      p_cluster_key: null,
      p_dedupe_hours: null,
    });
    if (r.error) saved.errors.push(`unscored: ${r.error.message}`);
  }

  if (live) {
    await heartbeat(supabase, {
      last_success_end: w.end.toISOString(),
      last_success_at: now.toISOString(),
      last_window_start: w.start.toISOString(),
      consecutive_failures: 0,
      catchup_failures: 0,
      last_actors_seen: fetched.rows.length,
      last_clusters: clusters.length,
      // Insert failures are recorded without blocking the success fields:
      // re-scanning would hit the same rows again.
      last_persist_error: saved.errors.length ? saved.errors.join('; ').slice(0, 300) : null,
    });
  }

  return Response.json({
    firing_id: firingId,
    window_start: w.start.toISOString(),
    window_end: w.end.toISOString(),
    catching_up: w.catchingUp,
    backfill: !live,
    unscored: w.unscored ? { start: w.unscored.start.toISOString(), end: w.unscored.end.toISOString() } : null,
    actors_seen: fetched.rows.length,
    actors_scored: clusters.reduce((n, c) => n + c.actors.length, 0),
    clusters: clusters.map((c) => ({
      key: c.key,
      label: c.label,
      score: c.score,
      severity: c.severity,
      check: c.checkFlag,
      ips: c.actors.length,
      requests: c.requests,
    })),
    events_written: saved.events,
    anomalies_raised: saved.anomalies,
    errors: saved.errors,
    url_bytes: fetched.url.length,
  });
});
