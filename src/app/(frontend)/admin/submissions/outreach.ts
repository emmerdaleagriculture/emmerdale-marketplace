import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatGBP } from '@/lib/sealedQuotes/money';
import type { OutreachCounts, OutreachLine, OutreachStage } from './OutreachStats';

export type Outreach = { counts: OutreachCounts; lines: Record<OutreachStage, OutreachLine[]> };

/**
 * Who is behind each outreach number on a submission: the invitation emails,
 * the contractors who opened / priced / passed, and the prices shown to the
 * customer. Counted the way admin_submission_board() counts, so the numbers
 * match the card. Service role — callers must already be admin-gated.
 */
export async function loadOutreach(id: string): Promise<Outreach> {
  const admin = createServiceRoleClient();
  const [invitationsQ, emailsQ, contractorQuotesQ, clientQuotesQ] = await Promise.all([
    admin
      .from('job_invitations')
      .select('id, status, decline_reason, distance_miles, sent_at, opened_at, contractor:contractors(business_name, email)')
      .eq('submission_id', id)
      .order('sent_at', { ascending: true }),
    admin
      .from('pending_emails')
      .select('id, to_email, status, delivery_status, delivery_detail, delivery_at, sent_at, created_at')
      .eq('kind', 'sq_invitation')
      .eq('payload->>submission_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('contractor_quotes')
      .select('id, invitation_id, contractor_price_pence, quote_type, superseded_by, created_at')
      .eq('submission_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('client_quotes')
      .select('id, status, client_price_pence, contractor_display_label, contractor_real_name, created_at, cq:contractor_quotes(contractor:contractors(business_name))')
      .eq('submission_id', id)
      .order('created_at', { ascending: true }),
  ]);
  const invitations = invitationsQ.data ?? [];
  const emails = emailsQ.data ?? [];
  const contractorQuotes = contractorQuotesQ.data ?? [];
  const clientQuotes = clientQuotesQ.data ?? [];

  type Inv = (typeof invitations)[number];
  type Email = (typeof emails)[number];

  const latestQuote = new Map<string, (typeof contractorQuotes)[number]>();
  for (const q of contractorQuotes) {
    if (!q.superseded_by || !latestQuote.has(q.invitation_id)) latestQuote.set(q.invitation_id, q);
  }
  const declined = (inv: Inv) => inv.decline_reason != null || inv.status === 'declined';
  const passed = (inv: Inv) => !latestQuote.has(inv.id) && declined(inv);
  const failedEmail = (e: Email) =>
    e.status === 'failed' || ['bounced', 'complained', 'failed', 'suppressed'].includes(e.delivery_status ?? '');

  const counts: OutreachCounts = {
    invited: invitations.length,
    opened: invitations.filter((i) => i.opened_at).length,
    priced: invitations.filter((i) => latestQuote.has(i.id)).length,
    declined: invitations.filter(declined).length,
    emails_sent: emails.filter((e) => e.status === 'sent').length,
    emails_delivered: emails.filter((e) => e.delivery_status === 'delivered').length,
    emails_failed: emails.filter(failedEmail).length,
    quotes_live: clientQuotes.filter((q) => q.status === 'active').length,
    lowest_client_pence: clientQuotes
      .filter((q) => q.status === 'active' || q.status === 'accepted')
      .reduce<number | null>((m, q) => (m == null || q.client_price_pence < m ? q.client_price_pence : m), null),
  };

  const contractorOf = (inv: Inv) => inv.contractor as { business_name: string; email: string | null } | null;
  const invByEmail = new Map(
    invitations.flatMap((inv) => {
      const email = contractorOf(inv)?.email;
      return email ? [[email.toLowerCase(), inv] as const] : [];
    }),
  );
  const outcome = (inv: Inv) => {
    const q = latestQuote.get(inv.id);
    if (q) return `Priced ${formatGBP(q.contractor_price_pence)}${q.quote_type === 'rate' ? ' (rate)' : ''}`;
    if (passed(inv)) return `Passed${inv.decline_reason ? ` — ${inv.decline_reason.replace(/_/g, ' ')}` : ''}`;
    return inv.opened_at ? 'Opened, no response yet' : 'Not opened';
  };
  const invLine = (inv: Inv, when: string | null): OutreachLine => ({
    key: inv.id,
    who: contractorOf(inv)?.business_name ?? '—',
    sub: inv.distance_miles != null ? `${inv.distance_miles} mi` : undefined,
    what: outcome(inv),
    when,
  });
  const byTime = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');

  const emailed: OutreachLine[] = emails.map((e) => {
    const inv = invByEmail.get(e.to_email.toLowerCase());
    const bad = failedEmail(e);
    return {
      key: e.id,
      who: (inv && contractorOf(inv)?.business_name) ?? e.to_email,
      sub: inv ? e.to_email : undefined,
      what: bad
        ? `Failed — ${e.delivery_detail ?? e.delivery_status ?? e.status}`
        : e.status === 'sent'
          ? (e.delivery_status ?? 'sent')
          : e.status,
      when: e.delivery_at ?? e.sent_at ?? e.created_at,
      bad,
    };
  });
  // Invited but never emailed (opted out of job emails): still listed.
  const emailedTo = new Set(emails.map((e) => e.to_email.toLowerCase()));
  for (const inv of invitations) {
    const email = contractorOf(inv)?.email?.toLowerCase();
    if (email && emailedTo.has(email)) continue;
    emailed.push({ ...invLine(inv, inv.sent_at), what: `No email sent · ${outcome(inv)}` });
  }

  return {
    counts,
    lines: {
      emailed,
      opened: invitations
        .filter((i) => i.opened_at)
        .sort((a, b) => byTime(a.opened_at, b.opened_at))
        .map((i) => invLine(i, i.opened_at)),
      responded: invitations
        .filter((i) => latestQuote.has(i.id) || passed(i))
        .map((i) => invLine(i, latestQuote.get(i.id)?.created_at ?? null)),
      // Prices first, then the passes the box's hint counts.
      priced: [
        ...invitations.filter((i) => latestQuote.has(i.id)).map((i) => invLine(i, latestQuote.get(i.id)!.created_at)),
        ...invitations.filter(passed).map((i) => ({ ...invLine(i, null), bad: true })),
      ],
      client: clientQuotes.map((cq) => {
        const inner = cq.cq as { contractor: { business_name: string } | null } | null;
        return {
          key: cq.id,
          who: inner?.contractor?.business_name ?? cq.contractor_real_name ?? cq.contractor_display_label,
          sub: `shown as ${cq.contractor_display_label}`,
          what: `${formatGBP(cq.client_price_pence)} · ${cq.status}`,
          when: cq.created_at,
          bad: cq.status !== 'active' && cq.status !== 'accepted',
        };
      }),
    },
  };
}
