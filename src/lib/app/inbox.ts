import { createServiceRoleClient } from '@/lib/supabase/server';
import { timeAgo } from '@/lib/time';

/**
 * The app's Messages tab: every conversation the signed-in person is in,
 * newest first, with the other side's name, the last line and how many of
 * theirs are unread. Each row links to the thread where it already lives —
 * the customer's job page or the contractor's price page — so there is one
 * place messages are read and written, as before.
 *
 * Service role for the same reason as lib/sealedQuotes/messages.ts.
 */
export type InboxThread = {
  invitationId: string;
  href: string;
  /** "Operator B" before booking, the business afterwards; for a contractor, the customer. */
  name: string;
  job: string;
  last: { body: string; when: string; mine: boolean };
  unread: number;
};

type Row = {
  id: string;
  body: string;
  created_at: string;
  sender: string;
  read_at: string | null;
  moderation: string | null;
  invitation_id: string;
  job_invitations: { display_label: string | null; contractor_id: string; token: string } | null;
  job_submissions: {
    customer_id: string | null;
    client_token: string | null;
    service_verbatim: string | null;
    contact_name: string | null;
    awarded_contractor_id: string | null;
    service: { name: string } | null;
  } | null;
};

const SELECT =
  'id, body, created_at, sender, read_at, moderation, invitation_id, ' +
  'job_invitations!inner(display_label, contractor_id, token), ' +
  'job_submissions!inner(customer_id, client_token, service_verbatim, contact_name, awarded_contractor_id, service:services(name))';

function clip(text: string, n: number) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function getInbox(userId: string, side: 'customer' | 'contractor'): Promise<InboxThread[]> {
  const admin = createServiceRoleClient();
  const me = side === 'customer' ? 'client' : 'contractor';

  let q = admin.from('job_messages').select(SELECT).order('created_at', { ascending: false }).limit(600);
  q =
    side === 'customer'
      ? q.eq('job_submissions.customer_id', userId)
      : q.eq('job_invitations.contractor_id', userId);
  const { data, error } = await q;
  if (error) {
    console.error('[app/inbox] failed:', error);
    return [];
  }
  const rows = (data ?? []) as unknown as Row[];

  // Newest first already, so the first row seen for a thread is its last line.
  const threads = new Map<string, InboxThread>();
  const businessIds = new Set<string>();
  for (const m of rows) {
    // The other side's held or refused messages are not theirs to see.
    if (m.sender !== me && m.moderation != null && m.moderation !== 'approved') continue;
    const inv = m.job_invitations;
    const js = m.job_submissions;
    if (!inv || !js) continue;
    let t = threads.get(m.invitation_id);
    if (!t) {
      const booked = js.awarded_contractor_id === inv.contractor_id;
      if (side === 'customer' && booked) businessIds.add(inv.contractor_id);
      t = {
        invitationId: m.invitation_id,
        href:
          side === 'customer'
            ? `/my/${js.client_token}#messages`
            : `/quote/${inv.token}#messages`,
        name:
          side === 'customer'
            ? booked
              ? inv.contractor_id // swapped for the business name below
              : inv.display_label ?? 'Operator'
            : booked
              ? js.contact_name ?? 'The customer'
              : 'The customer',
        job: clip(js.service?.name ?? js.service_verbatim ?? 'Job', 60),
        last: { body: clip(m.body, 90), when: timeAgo(m.created_at), mine: m.sender === me },
        unread: 0,
      };
      threads.set(m.invitation_id, t);
    }
    if (m.sender !== me && m.read_at === null) t.unread += 1;
  }

  if (businessIds.size > 0) {
    const { data: cs } = await admin
      .from('contractors')
      .select('id, business_name')
      .in('id', [...businessIds]);
    const names = new Map((cs ?? []).map((c) => [c.id, c.business_name]));
    for (const t of threads.values()) {
      const n = names.get(t.name);
      if (n) t.name = n;
    }
  }

  return [...threads.values()];
}
