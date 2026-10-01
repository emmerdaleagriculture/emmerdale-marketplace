import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import type { MessageSender } from './messageText';

/**
 * Site visits arranged in a customer↔contractor thread before anything is
 * booked (20261001120000_thread_visits). Either side proposes a time, the
 * other accepts or declines; an accepted visit shows each side the other's
 * name and phone, and the contractor the address. Service role throughout,
 * like the messages: thread_visits has RLS on and no policies.
 */

export type VisitStatus = 'proposed' | 'accepted' | 'held' | 'declined' | 'withdrawn' | 'cancelled' | 'lapsed';

export type ThreadVisit = {
  id: string;
  invitationId: string;
  proposedBy: MessageSender;
  startsAt: string;
  /** "Thu 9 Oct, 10:30", in London. */
  when: string;
  status: VisitStatus;
  cancelledBy: MessageSender | 'system' | null;
  createdAt: string;
  /** The time has come — an agreed visit can no longer be called off. */
  past: boolean;
};

/** What an agreed visit shows one side about the other. */
export type VisitContact = { title: string; lines: string[] };

const LONDON = 'Europe/London';

export function formatVisitWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: LONDON,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type VisitRow = {
  id: string;
  invitation_id: string;
  proposed_by: string;
  starts_at: string;
  status: string;
  cancelled_by: string | null;
  created_at: string;
};

function toVisit(v: VisitRow): ThreadVisit {
  return {
    id: v.id,
    invitationId: v.invitation_id,
    proposedBy: v.proposed_by as MessageSender,
    startsAt: v.starts_at,
    when: formatVisitWhen(v.starts_at),
    status: v.status as VisitStatus,
    cancelledBy: v.cancelled_by as ThreadVisit['cancelledBy'],
    createdAt: v.created_at,
    past: new Date(v.starts_at) <= new Date(),
  };
}

const COLUMNS = 'id, invitation_id, proposed_by, starts_at, status, cancelled_by, created_at';

export async function getThreadVisits(invitationId: string): Promise<ThreadVisit[]> {
  const { data } = await createServiceRoleClient()
    .from('thread_visits')
    .select(COLUMNS)
    .eq('invitation_id', invitationId)
    .order('created_at', { ascending: true })
    .limit(200);
  return (data ?? []).map(toVisit);
}

/** Every visit on a job, grouped by thread, for the customer's page. */
export async function getSubmissionVisits(submissionId: string): Promise<Map<string, ThreadVisit[]>> {
  const { data } = await createServiceRoleClient()
    .from('thread_visits')
    .select(COLUMNS)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true })
    .limit(500);
  const out = new Map<string, ThreadVisit[]>();
  for (const v of (data ?? []).map(toVisit)) {
    const list = out.get(v.invitationId) ?? [];
    list.push(v);
    out.set(v.invitationId, list);
  }
  return out;
}

/** null when a visit can be arranged on this thread now, otherwise why not. */
export async function visitBlocked(invitationId: string, by: MessageSender): Promise<string | null> {
  const { data } = await createServiceRoleClient().rpc('sq_thread_visit_blocked', {
    p_invitation_id: invitationId,
    p_by: by,
  });
  return (data as string | null) ?? null;
}

/** The customer, as an agreed visit shows them to the contractor. */
export async function customerContactForVisit(submissionId: string): Promise<VisitContact | null> {
  const { data } = await createServiceRoleClient()
    .from('job_submissions')
    .select('contact_name, contact_phone, postcode, gate_w3w')
    .eq('id', submissionId)
    .maybeSingle();
  if (!data) return null;
  return {
    title: 'For the visit',
    lines: [
      data.contact_name,
      data.contact_phone && `Phone: ${data.contact_phone}`,
      data.postcode && `Postcode: ${data.postcode}`,
      data.gate_w3w && `Gate: ///${data.gate_w3w.replace(/^\/+/, '')}`,
    ].filter((l): l is string => Boolean(l)),
  };
}

/** The contractor, as an agreed visit shows them to the customer. */
export async function contractorContactForVisit(invitationId: string): Promise<VisitContact | null> {
  const { data } = await createServiceRoleClient()
    .from('job_invitations')
    .select('contractor:contractors (business_name, phone)')
    .eq('id', invitationId)
    .maybeSingle();
  const ct = data?.contractor as { business_name: string; phone: string | null } | null;
  if (!ct) return null;
  return {
    title: 'Who is coming',
    lines: [ct.business_name, ct.phone && `Phone: ${ct.phone}`].filter((l): l is string => Boolean(l)),
  };
}

/** The sentence for each refusal the sq_thread_visit_* functions can return. */
export function visitRefusal(reason: string | undefined): string {
  switch (reason) {
    case 'bad_time':
      return 'Pick a time at least two hours from now and within the next two months.';
    case 'closed':
      return 'Visits can only be arranged while the job is still being priced.';
    case 'moderated':
      return 'Site visits can’t be arranged in this conversation at the moment.';
    case 'no_thread':
      return 'You can arrange a visit once the contractor has sent a price or a question.';
    case 'too_many':
      return 'That’s a lot of suggested times today — please wait for an answer.';
    case 'already_agreed':
      return 'A visit is already agreed — call it off first if you need a different time.';
    case 'past':
      return 'That time has passed.';
    case 'not_open':
    case 'own_proposal':
    case 'not_yours':
      return 'This visit has already been answered — refresh to see where it stands.';
    default:
      return 'That didn’t work — please try again.';
  }
}

/**
 * One server-side entry point for every visit button in a thread. The page's
 * own action resolves who is asking and which thread from its token, then
 * hands over here. Fields: op (propose | accept | decline | cancel),
 * visit_id, and for a proposal date (YYYY-MM-DD) and time (HH:MM), London.
 */
export async function runVisitOp(
  invitationId: string,
  by: MessageSender,
  formData: FormData,
): Promise<FormState> {
  const op = String(formData.get('op') ?? '');
  const visitId = String(formData.get('visit_id') ?? '');
  const admin = createServiceRoleClient();
  // A uuid parameter refuses anything else with an error that would carry
  // the submitted text into the logs; checked here instead.
  if (op !== 'propose' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitId)) {
    return { error: visitRefusal(undefined) };
  }

  let res: { data: unknown; error: { message: string } | null };
  if (op === 'propose') {
    const date = String(formData.get('date') ?? '');
    const time = String(formData.get('time') ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return { error: 'Pick a day and a time.' };
    }
    res = await admin.rpc('sq_thread_visit_propose', {
      p_invitation_id: invitationId,
      p_by: by,
      p_local: `${date} ${time}`,
    });
  } else if (op === 'accept' || op === 'decline') {
    res = await admin.rpc('sq_thread_visit_answer', {
      p_visit_id: visitId,
      p_invitation_id: invitationId,
      p_by: by,
      p_accept: op === 'accept',
    });
  } else if (op === 'cancel') {
    res = await admin.rpc('sq_thread_visit_cancel', {
      p_visit_id: visitId,
      p_invitation_id: invitationId,
      p_by: by,
    });
  } else {
    return { error: visitRefusal(undefined) };
  }

  const out = res.data as { ok: boolean; reason?: string } | null;
  if (res.error || !out?.ok) {
    if (res.error) console.error(`[sq] visit ${op} failed:`, res.error.message);
    return { error: visitRefusal(out?.reason) };
  }
  return { ok: true };
}
