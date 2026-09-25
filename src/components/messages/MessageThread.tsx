'use client';

import { useActionState, useEffect, useState } from 'react';
import { emptyFormState, type FormState } from '@/lib/form';
import { MESSAGE_MAX, type MessageSender } from '@/lib/sealedQuotes/messageText';
import type { ThreadMessage } from '@/lib/sealedQuotes/messages';
import f from '@/components/forms/forms.module.css';
import s from './messages.module.css';

type SendState = FormState & { body?: string };
type SendAction = (prev: SendState, data: FormData) => Promise<SendState>;

type Props = {
  /** Who is looking: their messages sit on the right. */
  me: MessageSender;
  /** What the other side is called here: "Contractor B", a business, "The customer". */
  otherName: string;
  messages: ThreadMessage[];
  unread?: number;
  /** One sentence under the name: what this thread is for and what not to put in it. */
  intro?: string;
  /** Null when the thread is read-only; the sentence says why. */
  action: SendAction | null;
  /**
   * Marks the other side's messages read. Run from the browser once the
   * thread is on screen, never during the server render: mail scanners
   * fetch emailed links, and that fetch is not someone reading.
   */
  markRead?: () => Promise<void>;
  closedNote?: string;
  /** Posted with the message: the page token, and on the customer side which thread. */
  hidden: Record<string, string>;
};

/**
 * One customer↔contractor conversation. Rendered on the server's list of
 * messages; sending posts to the page's own server action, which revalidates
 * the page so the new message comes back in the list.
 */
export function MessageThread({
  me,
  otherName,
  messages,
  unread = 0,
  intro,
  action,
  closedNote,
  hidden,
  markRead,
}: Props) {
  useEffect(() => {
    if (unread > 0 && markRead) markRead().catch(() => undefined);
  }, [unread, markRead]);

  return (
    <section className={s.thread} aria-label={`Messages with ${otherName}`}>
      <div className={s.head}>
        <span className={s.name}>{otherName}</span>
        {unread > 0 && <span className={s.badge}>{unread} new</span>}
      </div>
      {intro && <p className={s.intro}>{intro}</p>}

      {messages.length > 0 ? (
        <div className={s.list}>
          {messages.map((m) => (
            <div key={m.id} className={`${s.msg} ${m.sender === me ? s.mine : s.theirs}`}>
              {m.body}
              <span className={s.meta}>
                {m.sender === me ? 'You' : otherName} · {m.when}
              </span>
            </div>
          ))}
        </div>
      ) : (
        action && <p className={s.empty}>No messages yet.</p>
      )}

      {action ? (
        <Composer action={action} hidden={hidden} otherName={otherName} />
      ) : (
        closedNote && <p className={s.closed}>{closedNote}</p>
      )}
    </section>
  );
}

function Composer({
  action,
  hidden,
  otherName,
}: {
  action: SendAction;
  hidden: Record<string, string>;
  otherName: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState as SendState);
  // Controlled, so React's reset of the form after every submission leaves
  // it alone: a refused message keeps its words (the action hands them back)
  // and only a sent one clears.
  const [text, setText] = useState('');
  useEffect(() => {
    if (state.ok) setText('');
    else if (state.body !== undefined) setText(state.body);
  }, [state]);

  return (
    <form action={formAction}>
      {state.error && <p className={f.error}>{state.error}</p>}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className={f.field}>
        <span className={f.label}>Message {otherName}</span>
        <textarea
          className={f.textarea}
          name="body"
          rows={3}
          maxLength={MESSAGE_MAX}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
