import { createServiceRoleClient } from '@/lib/supabase/server';

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

/**
 * Which of these failures were put right by a later attempt.
 *
 * Retries chain — a message can fail, be retried, fail again, and arrive on
 * the third go — so a failure is resolved if *any* descendant was delivered,
 * not just its immediate child. Hence the walk rather than a single lookup.
 */
async function resolvedByRetry(
  admin: ReturnType<typeof createServiceRoleClient>,
  failureIds: string[],
  from: string,
): Promise<Set<string>> {
  const resolved = new Set<string>();
  if (failureIds.length === 0) return resolved;

  const { data } = await admin
    .from('pending_emails')
    .select('id, retry_of, delivery_status')
    .not('retry_of', 'is', null)
    .gte('created_at', from)
    .limit(1000);

  const children = new Map<string, { id: string; delivered: boolean }[]>();
  for (const r of data ?? []) {
    if (!r.retry_of) continue;
    const list = children.get(r.retry_of) ?? [];
    list.push({ id: r.id, delivered: r.delivery_status === 'delivered' });
    children.set(r.retry_of, list);
  }

  const arrived = (id: string, seen: Set<string>): boolean => {
    // Guards against a cycle, which the data should never contain but which
    // would otherwise hang the admin page rather than merely mislead it.
    if (seen.has(id)) return false;
    seen.add(id);
    return (children.get(id) ?? []).some((c) => c.delivered || arrived(c.id, seen));
  };

  for (const id of failureIds) if (arrived(id, new Set())) resolved.add(id);
  return resolved;
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
  const resolved = await resolvedByRetry(
    admin,
    (emailsQ.data ?? []).map((e) => e.id),
    from,
  );

  const emails = new Map<string, EmailFailure>();
  for (const e of emailsQ.data ?? []) {
    if (resolved.has(e.id)) continue;
    // Prefer the provider's verdict: 'failed to send' and 'sent, then bounced'
    // are different problems with different fixes.
    const status = e.delivery_status ?? e.status;
    const key = `${e.kind}|${status}|${e.delivery_detail ?? ''}`;
    const cur = emails.get(key);
    if (cur) cur.count += 1;
    else
      emails.set(key, {
        kind: e.kind,
        status,
        detail: e.delivery_detail,
        count: 1,
        last: e.created_at,
      });
  }

  return {
    days: DAYS,
    refusals: [...refusals.values()].sort((a, b) => b.count - a.count),
    emails: [...emails.values()].sort((a, b) => b.count - a.count),
    payments: (paymentsQ.data ?? []) as PaymentFailure[],
  };
}
