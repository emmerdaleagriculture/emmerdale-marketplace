import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import type { MessageSender, ThreadState } from './messageText';
import { signMessagePhotos } from './messagePhotos';

/**
 * Reads for the customer↔contractor threads (20260925140000_job_messages).
 * Service role, like the rest of the token-addressed pages: job_messages has
 * RLS on and no policies, so nothing reaches it except through here, the
 * admin page and sq_post_message.
 */

export type ThreadMessage = {
  id: string;
  sender: MessageSender;
  body: string;
  when: string;
  /** ISO, for ordering alongside the thread's visits. */
  createdAt: string;
  read: boolean;
  /** Signed, short-lived URLs for the photos sent with it. */
  photos: string[];
  /**
   * Only ever set on the reader's own messages: waiting for a moderator, or
   * refused by one. The other side never receives either.
   */
  moderation: 'held' | 'rejected' | null;
};

type MessageRow = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
  read_at: string | null;
  photo_paths: string[];
  moderation: string | null;
};

/**
 * Whether the reader may see this message. Everything delivered, plus their
 * own held or refused ones — never the other side's before a moderator has
 * let it through.
 */
function visibleTo(m: MessageRow, reader: MessageSender) {
  return m.moderation == null || m.moderation === 'approved' || m.sender === reader;
}

function toMessage(m: MessageRow, urls: Map<string, string>): ThreadMessage {
  return {
    id: m.id,
    sender: m.sender as MessageSender,
    body: m.body,
    when: formatDateTime(m.created_at),
    createdAt: m.created_at,
    read: m.read_at !== null,
    photos: m.photo_paths.map((p) => urls.get(p)).filter((u): u is string => !!u),
    moderation: m.moderation === 'held' || m.moderation === 'rejected' ? m.moderation : null,
  };
}

/** Sign every photo on these rows in one call. */
function signAll(rows: MessageRow[]) {
  return signMessagePhotos(rows.flatMap((m) => m.photo_paths));
}

export async function getThreadState(invitationId: string): Promise<ThreadState> {
  const { data } = await createServiceRoleClient().rpc('sq_thread_state', {
    p_invitation_id: invitationId,
  });
  return (data as ThreadState | null) ?? 'closed';
}

export async function getThreadMessages(
  invitationId: string,
  reader: MessageSender,
): Promise<ThreadMessage[]> {
  const { data } = await createServiceRoleClient()
    .from('job_messages')
    .select('id, sender, body, created_at, read_at, photo_paths, moderation')
    .eq('invitation_id', invitationId)
    .order('created_at', { ascending: true })
    .limit(500);
  const rows = (data ?? []).filter((m) => visibleTo(m, reader));
  const urls = await signAll(rows);
  return rows.map((m) => toMessage(m, urls));
}

/**
 * The reader has seen the thread. Called from the page in the browser, not
 * while rendering it: link scanners fetch emailed links without a person
 * behind them, and a GET that marked things read would clear the badge — and
 * lift the email hold — before anyone had looked.
 */
export async function markThreadRead(invitationId: string, reader: MessageSender) {
  const { error } = await createServiceRoleClient().rpc('sq_mark_thread_read', {
    p_invitation_id: invitationId,
    p_reader: reader,
  });
  if (error) console.error('[sq] mark thread read failed:', error.message);
}

export type ClientThread = {
  invitationId: string;
  /** "Contractor B" before award, the business name on the winner's thread after. */
  name: string;
  state: ThreadState;
  messages: ThreadMessage[];
  unread: number;
  /** The contractor's conversations are under moderation. */
  moderated: boolean;
};

/**
 * The threads a customer sees on their job page. Before award: every
 * contractor with a label (they have priced or written) whose thread is still
 * open, and any other thread that has messages in it. After award: the
 * winner's thread, plus the others only if something was said in them.
 * Two queries whatever the number of contractors.
 */
export async function getClientThreads(submissionId: string): Promise<ClientThread[]> {
  const admin = createServiceRoleClient();
  const [threadsRes, messagesRes] = await Promise.all([
    admin.rpc('sq_submission_threads', { p_submission_id: submissionId }),
    admin
      .from('job_messages')
      .select('id, invitation_id, sender, body, created_at, read_at, photo_paths, moderation')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true })
      .limit(2000),
  ]);
  const rows = (threadsRes.data ?? []) as {
    invitation_id: string;
    display_label: string;
    business_name: string | null;
    state: ThreadState;
  }[];

  const messageRows = (messagesRes.data ?? []).filter((m) => visibleTo(m, 'client'));
  const { data: moderatedRows } = await admin
    .from('job_invitations')
    .select('id, contractor:contractors (messages_moderated_until)')
    .eq('submission_id', submissionId);
  const now = new Date();
  const moderated = new Set(
    (moderatedRows ?? [])
      .filter((r) => {
        const until = (r.contractor as { messages_moderated_until: string | null } | null)?.messages_moderated_until;
        return until != null && new Date(until) > now;
      })
      .map((r) => r.id),
  );
  const urls = await signAll(messageRows);
  const byThread = new Map<string, ThreadMessage[]>();
  for (const m of messageRows) {
    const list = byThread.get(m.invitation_id) ?? [];
    list.push(toMessage(m, urls));
    byThread.set(m.invitation_id, list);
  }

  return rows
    .map((t) => {
      const messages = byThread.get(t.invitation_id) ?? [];
      return {
        invitationId: t.invitation_id,
        name: t.state === 'post_award' && t.business_name ? t.business_name : t.display_label,
        state: t.state,
        messages,
        unread: messages.filter((m) => m.sender === 'contractor' && !m.read).length,
        moderated: moderated.has(t.invitation_id),
      };
    })
    .filter((t) => t.state !== 'closed' || t.messages.length > 0)
    // The live conversation first: the winner after award, open ones before.
    .sort((a, b) => Number(b.state !== 'closed') - Number(a.state !== 'closed'));
}

/**
 * The date a contractor's conversations stop being moderated, or null when
 * they are not. Before award, messages both ways wait for an admin until then.
 */
export async function getModeratedUntil(contractorId: string): Promise<Date | null> {
  const { data } = await createServiceRoleClient()
    .from('contractors')
    .select('messages_moderated_until')
    .eq('id', contractorId)
    .maybeSingle();
  const until = data?.messages_moderated_until ? new Date(data.messages_moderated_until) : null;
  return until && until > new Date() ? until : null;
}
