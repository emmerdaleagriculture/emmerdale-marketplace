/**
 * The heartbeat: a short, fixed list of "is this still working?" questions,
 * asked every 15 minutes by /api/cron/heartbeat and on demand from
 * /admin/errors. Each answers ok / not ok with one line saying why.
 *
 * It is not a test suite. Each check reads what the system has already done
 * (a cron's last run, a queue's oldest unsent row) or makes one cheap,
 * side-effect-free call (render an invoice PDF in memory, ask Stripe for the
 * balance). Nothing here sends, charges or writes anything but its own row.
 *
 * Adding a feature that runs unattended? Add a check here: that is the whole
 * point of having one list.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { HTTP_CRONS, isLate } from '@/lib/cron/registry';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { siteUrl } from '@/lib/site';

export type CheckResult = { name: string; ok: boolean; detail: string; ms: number };
type Check = { name: string; run: () => Promise<{ ok: boolean; detail: string }> };

const TIMEOUT_MS = 20_000;
const minutesAgo = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60_000) : null);
const ago = (iso: string | null) => {
  const m = minutesAgo(iso);
  if (m === null) return 'never';
  if (m < 90) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

/**
 * Roughly how often a pg_cron schedule fires, in minutes, for lateness only.
 * Conservative: when in doubt it answers the longer interval, so a check
 * never cries wolf over a schedule it has misread.
 */
export function cronEveryMinutes(schedule: string): number {
  const [min, hour, dom, , dow] = schedule.trim().split(/\s+/);
  if (dow && dow !== '*') return 7 * 24 * 60;
  if (dom && dom !== '*') return 31 * 24 * 60;
  if (hour && hour !== '*') return 24 * 60; // fixed hours or a range: once a day at worst
  if (min === '*') return 1;
  const step = min?.match(/^\*\/(\d+)$/);
  if (step) return Number(step[1]);
  if (min?.includes(',')) return Math.ceil(60 / min.split(',').length);
  return 60;
}

function httpCronChecks(): Check[] {
  return HTTP_CRONS.map((job) => ({
    name: `cron: ${job.name}`,
    run: async () => {
      const { data, error } = await createServiceRoleClient()
        .from('cron_runs')
        .select('started_at, finished_at, ok, error')
        .eq('name', job.name)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { ok: false, detail: `could not read cron_runs: ${error.message}` };
      if (!data) return { ok: false, detail: 'never seen: check it is registered in Vercel' };
      if (data.ok === false) return { ok: false, detail: `last run failed ${ago(data.started_at)}: ${data.error ?? 'no message'}` };
      if (!data.finished_at && (minutesAgo(data.started_at) ?? 0) > 30) return { ok: false, detail: `started ${ago(data.started_at)} and never finished` };
      if (isLate(job, data.started_at)) return { ok: false, detail: `no run since ${ago(data.started_at)}` };
      return { ok: true, detail: `last ran ${ago(data.started_at)}` };
    },
  }));
}

type PgJob = { jobname: string; schedule: string; active: boolean; last_status: string | null; last_start: string | null; last_message: string | null; failures_24h: number };

/** One check per pg_cron job, read in one query and shared. */
async function pgCronChecks(): Promise<Check[]> {
  const { data, error } = await createServiceRoleClient().rpc('cron_jobs_health');
  if (error) return [{ name: 'cron: database jobs', run: async () => ({ ok: false, detail: `could not read pg_cron: ${error.message}` }) }];
  return ((data ?? []) as PgJob[]).map((j) => ({
    name: `cron: ${j.jobname}`,
    run: async () => {
      if (!j.active) return { ok: false, detail: 'switched off' };
      if (!j.last_start) return { ok: false, detail: 'has never run' };
      if (j.last_status === 'failed') return { ok: false, detail: `last run failed ${ago(j.last_start)}: ${(j.last_message ?? '').slice(0, 200)}` };
      if (j.failures_24h > 0) return { ok: false, detail: `${j.failures_24h} failed run${j.failures_24h === 1 ? '' : 's'} in 24h` };
      const every = cronEveryMinutes(j.schedule);
      if ((minutesAgo(j.last_start) ?? 0) > every * 3 + 5) return { ok: false, detail: `no run since ${ago(j.last_start)}` };
      return { ok: true, detail: `last ran ${ago(j.last_start)}` };
    },
  }));
}

/** A queue is healthy while nothing has sat unsent for longer than `stuckAfter` minutes. */
function queueCheck(name: string, table: 'pending_emails' | 'pending_sms' | 'pending_push', stuckAfter: number): Check {
  return {
    name,
    run: async () => {
      // pending_sms / pending_push are not in the generated types; the columns
      // read here (status, created_at) are common to all three queues.
      const admin = createServiceRoleClient() as unknown as SupabaseClient;
      const cutoff = new Date(Date.now() - stuckAfter * 60_000).toISOString();
      const [stuck, failed] = await Promise.all([
        admin.from(table).select('created_at', { count: 'exact' }).eq('status', 'pending').lt('created_at', cutoff).order('created_at').limit(1),
        admin.from(table).select('id', { count: 'exact', head: true }).eq('status', 'failed').gt('created_at', new Date(Date.now() - 3600_000).toISOString()),
      ]);
      if (stuck.error) return { ok: false, detail: stuck.error.message };
      if ((stuck.count ?? 0) > 0) return { ok: false, detail: `${stuck.count} waiting longer than ${stuckAfter} min (oldest ${ago(stuck.data?.[0]?.created_at ?? null)})` };
      const f = failed.count ?? 0;
      // A handful of failures an hour is ordinary (bad numbers, dead addresses);
      // a burst means the provider or the sender is broken.
      if (f >= 10) return { ok: false, detail: `${f} failed in the last hour` };
      return { ok: true, detail: f ? `flowing; ${f} failed in the last hour` : 'flowing' };
    },
  };
}

const CHECKS_STATIC: Check[] = [
  {
    name: 'database',
    run: async () => {
      const { error } = await createServiceRoleClient().from('app_config').select('key').limit(1);
      return error ? { ok: false, detail: error.message } : { ok: true, detail: 'reachable' };
    },
  },
  {
    name: 'site: home and contractor pages',
    run: async () => {
      const base = siteUrl();
      const paths = ['/', '/agriculturalcontractors', '/notes'];
      const bad: string[] = [];
      for (const p of paths) {
        try {
          const r = await fetch(`${base}${p}`, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
          if (r.status !== 200) bad.push(`${p} ${r.status}`);
        } catch (err) {
          bad.push(`${p} ${err instanceof Error ? err.message : 'failed'}`);
        }
      }
      return bad.length ? { ok: false, detail: bad.join(', ') } : { ok: true, detail: `${paths.length} pages answer 200` };
    },
  },
  queueCheck('email queue', 'pending_emails', 10),
  queueCheck('sms queue', 'pending_sms', 15),
  queueCheck('app push queue', 'pending_push', 15),
  {
    name: 'books: receipts reading',
    run: async () => {
      const admin = createServiceRoleClient();
      const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
      const day = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [stuck, failed] = await Promise.all([
        admin.from('books_receipts').select('id', { count: 'exact', head: true }).eq('status', 'processing').lt('updated_at', cutoff),
        admin.from('books_receipts').select('id', { count: 'exact', head: true }).eq('status', 'failed').gt('updated_at', day),
      ]);
      if (stuck.error) return { ok: false, detail: stuck.error.message };
      if ((stuck.count ?? 0) > 0) return { ok: false, detail: `${stuck.count} receipt(s) stuck reading for over 30 min` };
      if ((failed.count ?? 0) >= 3) return { ok: false, detail: `${failed.count} receipts failed to read in 24h` };
      return { ok: true, detail: failed.count ? `${failed.count} failed in 24h` : 'nothing stuck' };
    },
  },
  {
    name: 'books: invoice PDF',
    run: async () => {
      // In memory only: the same renderer and fonts a sent invoice uses. This
      // is the check that would have caught the missing pdfkit fonts on Vercel.
      const { renderSamplePdf } = await import('./samplePdf');
      const bytes = await renderSamplePdf();
      return bytes > 1000 ? { ok: true, detail: `renders (${Math.round(bytes / 1024)} KB)` } : { ok: false, detail: `only ${bytes} bytes` };
    },
  },
  {
    name: 'books: sharing table',
    run: async () => {
      const { error } = await createServiceRoleClient().from('books_viewers').select('id', { head: true, count: 'exact' });
      return error ? { ok: false, detail: error.message } : { ok: true, detail: 'readable' };
    },
  },
  {
    name: 'stripe',
    run: async () => {
      if (!stripeConfigured()) return { ok: false, detail: 'STRIPE_SECRET_KEY not set' };
      const b = await getStripe().balance.retrieve();
      return { ok: true, detail: `key works (${b.livemode ? 'live' : 'test'} mode)` };
    },
  },
  {
    name: 'resend (email sending)',
    run: async () => {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { ok: false, detail: 'RESEND_API_KEY not set' };
      const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      // A sending-only key answers 401 "restricted" here, which still proves it is a live key.
      if (r.ok) return { ok: true, detail: 'key works' };
      const body = await r.text();
      if (r.status === 401 && /restricted/i.test(body)) return { ok: true, detail: 'sending key is live' };
      return { ok: false, detail: `Resend answered ${r.status}` };
    },
  },
  {
    name: 'config: keys present',
    run: async () => {
      const need = ['ANTHROPIC_API_KEY', 'CRON_SECRET', 'NEXT_PUBLIC_SENTRY_DSN', 'SUPABASE_SERVICE_ROLE_KEY'];
      const missing = need.filter((k) => !process.env[k]);
      return missing.length ? { ok: false, detail: `missing: ${missing.join(', ')}` } : { ok: true, detail: `${need.length} present` };
    },
  },
];

async function timed(c: Check): Promise<CheckResult> {
  const t = Date.now();
  try {
    const r = await Promise.race([
      c.run(),
      new Promise<{ ok: boolean; detail: string }>((resolve) => setTimeout(() => resolve({ ok: false, detail: `no answer in ${TIMEOUT_MS / 1000}s` }), TIMEOUT_MS)),
    ]);
    return { name: c.name, ok: r.ok, detail: r.detail.slice(0, 500), ms: Date.now() - t };
  } catch (err) {
    return { name: c.name, ok: false, detail: (err instanceof Error ? err.message : String(err)).slice(0, 500), ms: Date.now() - t };
  }
}

export async function runChecks(): Promise<CheckResult[]> {
  const checks = [...CHECKS_STATIC, ...httpCronChecks(), ...(await pgCronChecks())];
  return Promise.all(checks.map(timed));
}
