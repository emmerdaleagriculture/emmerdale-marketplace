'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/lib/form';
import { MESSAGE_MAX, type MessageSender } from '@/lib/sealedQuotes/messageText';
import type { ThreadMessage } from '@/lib/sealedQuotes/messages';
import f from '@/components/forms/forms.module.css';
import s from './messages.module.css';

const EMPTY: FormState = {};

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
  action: ((prev: FormState, data: FormData) => Promise<FormState>) | null;
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
}: Props) {
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
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  otherName: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const form = useRef<HTMLFormElement>(null);

  // Clear the box once it has gone; keep the words if it was refused, so
  // they can be reworded rather than retyped.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction}>
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
        />
      </label>
      <button className={f.btnPrimary} type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
