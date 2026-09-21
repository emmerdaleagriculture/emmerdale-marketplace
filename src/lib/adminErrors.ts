import { createServiceRoleClient } from '@/lib/supabase/server';
import { MAX_DELIVERY_RETRIES } from '@/lib/email/deliveryRetry';

/**
 * The things going wrong that Sentry will never see.
 *
 * Sentry catches what throws. Most of what actually costs this business money
 * does not throw: a customer refused at step 1 and gone, an email accepted by
 * Resend and then bounced, a balance the worker gave up charging. Every one of
 * those is a deliberate, handled outcome — working code, bad news — and each
 * is already recorded in its own table for its own reasons.
 *
 * This gathers them into one answer to "is anything wrong right now", so the
 * admin page can put them beside the exceptions rather than in three places
 * nobody thinks to open together.
 */

const DAYS = 30;
const since = () => new Date(Date.now() - DAYS * 86400 * 1000).toISOString();

export type Refusal = { action: string; outcome: string; reason: string; count: number; last: string };
export type EmailFailure = { kind: string; status: string; detail: string | null; count: number; last: string };
export type PaymentFailure = {
  id: string;
  kind: string | null;
  status: string;
  amount_pence: number;
  attempts: number | null;
  last_error: string | null;
  last_attempt_at: string | null;
};

export type AdminErrors = {
  days: number;
  refusals: Refusal[];
  emails: EmailFailure[];
  payments: PaymentFailure[];
};

/** Where a message finally ended up, if anything was attempted after it. */
type ChainEnd = { delivered: boolean; status: string; detail: string | null; at: string };

/**
 * How each of these failures actually ended.
 *
 * Retries chain — a message can fail, be retried, fail again, and arrive on
 * the third go — so neither question this answers can be settled by looking
 * at the immediate child. Did it eventually get through? And if it never
 * did, which attempt's diagnosis is the one worth showing? The last one:
 * "the provider was down for a minute" and "this address does not exist" are
 * the same chain seen at two moments, and only the second tells an admin
 * what to do about it.
 */
async function latestAttempt(
  admin: ReturnType<typeof createServiceRoleClient>,
  failureIds: string[],
): Promise<Map<string, ChainEnd>> {
  const latest = new Map<string, ChainEnd>();
  if (failureIds.length === 0) return latest;

  // Walked a generation at a time, asking only for the children of the rows
  // still in play, rather than pulling every retry in the window and sifting
  // it here. A blanket fetch needs a limit, and a limit without an order is a
  // silent wrong answer the day the table outgrows it: PostgREST would return
  // an arbitrary subset, a delivered retry could fall outside it, and a fixed
  // failure would start reappearing on the page between one load and the next.
  //
  // The loop is bounded by the same constant that bounds the retries, so the
  // depth cannot exceed the number of generations that can exist and no cycle
  // check is needed.
  let frontier = new Map(failureIds.map((id) => [id, id] as const));

  for (let depth = 0; depth < MAX_DELIVERY_RETRIES && frontier.size > 0; depth++) {
    const ids = [...frontier.keys()];
    type Row = {
      id: string;
      retry_of: string | null;
      status: string;
      delivery_status: string | null;
      delivery_detail: string | null;
      created_at: string;
    };
    const rows: Row[] = [];

    // Chunked because these go into the URL, and the failure list above can
    // run to 500 ids.
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await admin
        .from('pending_emails')
        .select('id, retry_of, status, delivery_status, delivery_detail, created_at')
        .in('retry_of', ids.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data ?? []));
    }

    const next = new Map<string, string>();
    for (const r of rows) {
      // Which original failure this attempt descends from, carried down so a
      // delivery three generations later still clears the right row.
      const root = r.retry_of ? frontier.get(r.retry_of) : undefined;
      if (!root) continue;

      // A retry still sitting in the queue has no verdict of its own yet, so
      // the original's is still the live one. Only a resolved attempt
      // supersedes it — and because chains are linear and walked in order,
      // the last generation to write here is the newest attempt.
      const settled = r.delivery_status != null || r.status === 'failed';
      if (settled) {
        latest.set(root, {
          delivered: r.delivery_status === 'delivered',
          status: r.delivery_status ?? r.status,
          detail: r.delivery_detail,
          at: r.created_at,
        });
      }

      if (r.delivery_status !== 'delivered') next.set(r.id, root);
    }
    frontier = next;
  }

  return latest;
}

export async function loadAdminErrors(): Promise<AdminErrors> {
  const admin = createServiceRoleClient();
  const from = since();

  const [refusalsQ, emailsQ, paymentsQ] = await Promise.all([
    // Why anyone was turned away from /start. Written by refuse() as the
    // message is returned, so it does not depend on a beacon being flushed.
    admin
      .from('job_parse_events')
      .select('action, outcome, reason, created_at')
      .in('outcome', ['rejected', 'fallback'])
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(2000),
    // Two different failures share this table: `status` is us failing to hand
    // the message over, `delivery_status` is the provider telling us later
    // that it never arrived. The second is invisible in the send logs.
    admin
      .from('pending_emails')
      .select('id, kind, status, delivery_status, delivery_detail, created_at')
      .or('status.eq.failed,delivery_status.in.(bounced,failed,suppressed)')
      // Only the first attempt at a message. A retry that also failed is the
      // same person still not hearing from us, and counting it again would
      // make a message we tried hardest to deliver look like the worst
      // problem on the page.
      .is('retry_of', null)
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(500),
    // A balance the worker could not take. `status` alone is not enough — a
    // row can still be 'due' and retrying with several failed attempts behind
    // it, which is worth seeing before it becomes final.
    admin
      .from('job_payments')
      .select('id, kind, status, amount_pence, attempts, last_error, last_attempt_at')
      .not('last_error', 'is', null)
      .gte('created_at', from)
      .order('last_attempt_at', { ascending: false })
      .limit(100),
  ]);

  // A query that fails must never read as "nothing is wrong". `data ?? []`
  // turns a rejected query into an empty list, and on this page an empty list
  // is an all-clear — the one thing it exists to stop being wrong about.
  for (const q of [refusalsQ, emailsQ, paymentsQ]) {
    if (q.error) throw new Error(`/admin/errors could not be loaded: ${q.error.message}`);
  }

  const refusals = new Map<string, Refusal>();
  for (const r of refusalsQ.data ?? []) {
    const reason = r.reason ?? '(unrecorded)';
    const key = `${r.action}|${r.outcome}|${reason}`;
    const cur = refusals.get(key);
    if (cur) cur.count += 1;
    else
      refusals.set(key, {
        action: r.action,
        outcome: r.outcome,
        reason,
        count: 1,
        last: r.created_at,
      });
  }

  // A failure that a later attempt fixed is history, not news. The webhook
  // queues a retry as a new row pointing back at this one, so walk forward:
  // if anything downstream of a failure was delivered, the person got their
  // email and the page should not still be reporting them as missing it.
  const latest = await latestAttempt(admin, (emailsQ.data ?? []).map((e) => e.id));

  const emails = new Map<string, EmailFailure>();
  for (const e of emailsQ.data ?? []) {
    const end = latest.get(e.id);
    if (end?.delivered) continue;

    // Prefer the provider's verdict: 'failed to send' and 'sent, then bounced'
    // are different problems with different fixes. And prefer the last
    // attempt's verdict over the first, so the row says why the message is
    // still undelivered rather than why the first try missed.
    const status = end?.status ?? e.delivery_status ?? e.status;
    const detail = end ? end.detail : e.delivery_detail;
    const at = end?.at ?? e.created_at;

    const key = `${e.kind}|${status}|${detail ?? ''}`;
    const cur = emails.get(key);
    if (cur) {
      cur.count += 1;
      if (at > cur.last) cur.last = at;
    } else
      emails.set(key, {
        kind: e.kind,
        status,
        detail,
        count: 1,
        last: at,
      });
  }

  return {
    days: DAYS,
    refusals: [...refusals.values()].sort((a, b) => b.count - a.count),
    emails: [...emails.values()].sort((a, b) => b.count - a.count),
    payments: (paymentsQ.data ?? []) as PaymentFailure[],
  };
}
