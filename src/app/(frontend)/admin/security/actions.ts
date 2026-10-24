'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';
import { collapseByIp, pathsOf } from '@/lib/security/probe';

/**
 * Every action re-checks the caller is an admin before touching anything
 * with the service role, same as the other admin actions. The tables these
 * write have RLS on and no policies, so the service role is the only way in.
 */
async function assertAdmin(): Promise<string> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user.email ?? 'admin';
}

const PAGES = ['/admin/security', '/admin/security/audit'];
function revalidate() {
  for (const p of PAGES) revalidatePath(p);
}

// ── Findings ─────────────────────────────────────────────────────────────────

/** Close a card with a note. The 6-hour dedupe means a scan still running opens a new one. */
export async function resolveAnomaly(formData: FormData): Promise<void> {
  const who = await assertAdmin();
  const id = Number(formData.get('id'));
  const note = String(formData.get('resolution') ?? '').trim();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid request');

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('security_anomalies')
    .update({ resolved_at: new Date().toISOString(), resolution: `${note || 'acknowledged'} (${who})` })
    .eq('id', id)
    .is('resolved_at', null);
  if (error) throw new Error(error.message);
  revalidate();
}

export type ClusterIp = {
  actor_ip: string;
  asn_org: string | null;
  country: string | null;
  requests: number;
  ip_score: number;
  check_flag: boolean;
  detected_at: string;
  paths: string[];
  response_action: string | null;
};

/** The IPs behind one card, one row each, newest firing wins. */
export async function loadClusterIps(clusterKey: string): Promise<ClusterIp[]> {
  await assertAdmin();
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('security_probe_events')
    .select('actor_ip, asn_org, country, requests, ip_score, check_flag, detected_at, top_paths, response_action')
    .eq('cluster_key', clusterKey)
    .order('detected_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return collapseByIp(data ?? []).map((r) => ({
    actor_ip: r.actor_ip,
    asn_org: r.asn_org,
    country: r.country,
    requests: r.requests,
    ip_score: r.ip_score,
    check_flag: r.check_flag,
    detected_at: r.detected_at,
    paths: pathsOf(r.top_paths),
    response_action: r.response_action,
  }));
}

// ── The detector ─────────────────────────────────────────────────────────────

type DetectorResponse = {
  window_start?: string;
  window_end?: string;
  catching_up?: boolean;
  backfill?: boolean;
  unscored?: { start: string; end: string } | null;
  actors_seen?: number;
  actors_scored?: number;
  clusters?: { label: string; score: number; severity: string; check: boolean; ips: number }[];
  events_written?: number;
  anomalies_raised?: number;
  errors?: string[];
  error?: string;
  detail?: string;
  status?: number;
};

const hm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

/**
 * POST to the edge function the way the cron does, with the cron secret.
 * The function checks the caller itself; the Vercel env already holds
 * CRON_SECRET for /api/cron/*.
 */
async function callDetector(body: Record<string, string>): Promise<FormState> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) return { error: 'NEXT_PUBLIC_SUPABASE_URL is not set.' };
  if (!secret && !serviceKey) return { error: 'Neither CRON_SECRET nor the service role key is set, so the detector cannot be called from here.' };

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers['x-cron-secret'] = secret;
  else if (serviceKey) headers.authorization = `Bearer ${serviceKey}`;

  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/detect-probe-activity`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    return { error: `Could not reach the detector: ${err instanceof Error ? err.message : String(err)}` };
  }
  const json = (await res.json().catch(() => ({}))) as DetectorResponse;
  if (!res.ok) {
    return {
      error: `Detector answered ${res.status}: ${json.error ?? 'no detail'}${json.detail ? ` (${json.detail})` : ''}`,
    };
  }
  const lines = [
    `${json.backfill ? 'Backfilled' : 'Scanned'} ${json.window_start ? hm(json.window_start) : '?'} to ${
      json.window_end ? hm(json.window_end) : '?'
    } UTC${json.catching_up ? ' (catching up)' : ''}: ${json.actors_seen ?? 0} actors with any suspicious counter, ` +
      `${json.clusters?.length ?? 0} cluster(s) over the floor, ${json.events_written ?? 0} event row(s) written.`,
  ];
  for (const c of json.clusters ?? []) {
    lines.push(`  ${c.severity.toUpperCase()} ${c.score} pts, ${c.ips} IP(s)${c.check ? ', CHECK' : ''}: ${c.label}`);
  }
  if (json.unscored) lines.push(`  Unscored: ${json.unscored.start} to ${json.unscored.end}. Backfill it below.`);
  if (json.errors?.length) lines.push(`  Errors: ${json.errors.join('; ')}`);
  revalidate();
  return { ok: true, message: lines.join('\n') };
}

export async function runScanNow(): Promise<FormState> {
  await assertAdmin();
  return callDetector({});
}

export async function backfillWindow(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const start = String(formData.get('window_start') ?? '').trim();
  const end = String(formData.get('window_end') ?? '').trim();
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { error: 'Both times are needed.' };
  if (e.getTime() <= s.getTime()) return { error: 'The end must be after the start.' };
  if (e.getTime() - s.getTime() > 24 * 3600_000) return { error: 'At most 24 hours per backfill: the Analytics API returns short results on wider windows.' };
  return callDetector({ window_start: s.toISOString(), window_end: e.toISOString() });
}

// ── Layer 0 ──────────────────────────────────────────────────────────────────

export async function runAuditNow(): Promise<FormState> {
  await assertAdmin();
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('audit_anon_writable_rpcs');
  if (error) return { error: error.message };
  const r = (data ?? {}) as { rpcs?: string[]; buckets?: string[]; policies?: string[]; errors?: string[] };
  const n = (r.rpcs?.length ?? 0) + (r.buckets?.length ?? 0) + (r.policies?.length ?? 0);
  revalidate();
  if (r.errors?.length) return { error: `The audit hit an error: ${r.errors.join('; ')}` };
  return {
    ok: true,
    message: n
      ? `${n} finding(s): ${r.rpcs?.length ?? 0} RPC, ${r.buckets?.length ?? 0} bucket, ${r.policies?.length ?? 0} policy. Cards are below.`
      : 'Clean: no writer RPC without a caller check, no public bucket serving active content, no open write policy.',
  };
}

// ── Allowlists ───────────────────────────────────────────────────────────────

const CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

export async function addProbeAllowlist(_prev: FormState, formData: FormData): Promise<FormState> {
  const who = await assertAdmin();
  const cidr = String(formData.get('cidr') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!CIDR.test(cidr)) return { error: 'An IPv4 address or CIDR, like 203.0.113.0/24.' };
  if (!reason) return { error: 'Say why this range never scores.' };
  const admin = createServiceRoleClient();
  const { error } = await admin.from('security_probe_allowlist').insert({ cidr, reason, added_by: who });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, message: `${cidr} will never score.` };
}

export async function removeProbeAllowlist(formData: FormData): Promise<void> {
  await assertAdmin();
  const cidr = String(formData.get('cidr') ?? '');
  const admin = createServiceRoleClient();
  const { error } = await admin.from('security_probe_allowlist').delete().eq('cidr', cidr);
  if (error) throw new Error(error.message);
  revalidate();
}

const KINDS = ['rpc', 'bucket_mime', 'policy'] as const;

export async function addAuditAllowlist(_prev: FormState, formData: FormData): Promise<FormState> {
  const who = await assertAdmin();
  const kind = String(formData.get('kind') ?? '');
  const item = String(formData.get('item') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!(KINDS as readonly string[]).includes(kind)) return { error: 'Pick what kind of finding this is.' };
  if (!item) return { error: 'Paste the item exactly as the card lists it.' };
  if (!reason) return { error: 'Say why it is acceptable. The next person reads this, not the card.' };
  const admin = createServiceRoleClient();
  const { error } = await admin.from('security_audit_allowlist').insert({ kind, item, reason, reviewed_by: who });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, message: `${item} is accepted. Run the audit again to close its card.` };
}

export async function removeAuditAllowlist(formData: FormData): Promise<void> {
  await assertAdmin();
  const kind = String(formData.get('kind') ?? '');
  const item = String(formData.get('item') ?? '');
  const admin = createServiceRoleClient();
  const { error } = await admin.from('security_audit_allowlist').delete().eq('kind', kind).eq('item', item);
  if (error) throw new Error(error.message);
  revalidate();
}
