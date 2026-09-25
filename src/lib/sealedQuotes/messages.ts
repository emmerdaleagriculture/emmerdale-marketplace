import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';
import type { MessageSender, ThreadState } from './messageText';

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
};

export async function getThreadState(invitationId: string): Promise<ThreadState> {
  const { data } = await createServiceRoleClient().rpc('sq_thread_state', {
    p_invitation_id: invitationId,
  });
  return (data as ThreadState | null) ?? 'closed';
}

export async function getThreadMessages(invitationId: string): Promise<ThreadMessage[]> {
  const { data } = await createServiceRoleClient()
    .from('job_messages')
    .select('id, sender, body, created_at')
    .eq('invitation_id', invitationId)
    .order('created_at', { ascending: true })
    .limit(500);
  return (data ?? []).map((m) => ({
    id: m.id,
    sender: m.sender as MessageSender,
    body: m.body,
    when: formatDateTime(m.created_at),
  }));
}

/**
 * Opening the page is reading the thread. Failure must not cost anyone their
 * page, so it is logged and swallowed.
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
};

/**
 * The threads a customer sees on their job page. Before award: every
 * contractor with a label (they have priced or written) whose thread is still
 * open, and any other thread that has messages in it. After award: the
 * winner's thread, plus the others only if something was said in them.
 */
export async function getClientThreads(submissionId: string): Promise<ClientThread[]> {
  const admin = createServiceRoleClient();
  const { data: invs } = await admin
    .from('job_invitations')
    .select('id, contractor_id, display_label, contractor:contractors (business_name)')
    .eq('submission_id', submissionId)
    .not('display_label', 'is', null)
    .order('display_label');
  if (!invs?.length) return [];

  const threads = await Promise.all(
    invs.map(async (inv) => {
      const [state, messages, unreadRes] = await Promise.all([
        getThreadState(inv.id),
        getThreadMessages(inv.id),
        admin
          .from('job_messages')
          .select('id', { count: 'exact', head: true })
          .eq('invitation_id', inv.id)
          .eq('sender', 'contractor')
          .is('read_at', null),
      ]);
      const business = (inv.contractor as { business_name: string | null } | null)?.business_name;
      return {
        invitationId: inv.id,
        name: state === 'post_award' && business ? business : (inv.display_label as string),
        state,
        messages,
        unread: unreadRes.count ?? 0,
      };
    }),
  );
  return threads
    .filter((t) => t.state !== 'closed' || t.messages.length > 0)
    // The live conversation first: the winner after award, open ones before.
    .sort((a, b) => Number(b.state !== 'closed') - Number(a.state !== 'closed'));
}
