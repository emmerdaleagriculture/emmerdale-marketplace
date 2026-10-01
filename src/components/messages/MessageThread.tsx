'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { downscalePhoto } from '@/lib/photoDownscale';
import { emptyFormState, type FormState } from '@/lib/form';
import { MESSAGE_MAX, type MessageSender } from '@/lib/sealedQuotes/messageText';
import type { ThreadMessage } from '@/lib/sealedQuotes/messages';
import type { ThreadVisit, VisitContact } from '@/lib/sealedQuotes/visits';
import { Hidden, VisitCard, VisitProposer, type VisitAction } from './ThreadVisits';
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
  /** Something the reader must not miss, above the messages: moderation, for one. */
  notice?: string;
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
  /** Site visits suggested in this thread, shown in order among the messages. */
  visits?: ThreadVisit[];
  /** Null when a visit can't be suggested or answered here now. */
  visitAction?: VisitAction | null;
  /** The other side's details, shown on an agreed visit. */
  visitContact?: VisitContact | null;
};

/**
 * Said on every open conversation a contractor sees: the platform reads
 * these, and what happens to anyone who uses them to take the work
 * elsewhere. Written after two jobs were arranged privately through the
 * messages in Sep 2026. Contractors only — customers aren't shown it.
 */
const MONITORED =
  'Messages are monitored. Any attempt to take work off the platform — swapping contact details before a job is booked, or arranging to be paid directly — can lead to your messages being moderated or to being removed from the network.';

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
  notice,
  action,
  closedNote,
  hidden,
  markRead,
  visits = [],
  visitAction = null,
  visitContact = null,
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
      {action && me === 'contractor' && <p className={s.monitored}>{MONITORED}</p>}
      {notice && (
        <p className={s.notice} role="note">
          {notice}
        </p>
      )}

      {messages.length + visits.length > 0 ? (
        <div className={s.list}>
          {timeline(messages, visits).map((item) =>
            item.kind === 'visit' ? (
              <VisitCard
                key={item.v.id}
                visit={item.v}
                me={me}
                otherName={otherName}
                action={visitAction}
                hidden={hidden}
                contact={visitContact}
              />
            ) : (
              <MessageBubble key={item.m.id} m={item.m} me={me} otherName={otherName} />
            ),
          )}
        </div>
      ) : (
        action && <p className={s.empty}>No messages yet.</p>
      )}

      {visitAction && !visits.some((v) => v.status === 'accepted' && !v.past) && (
        <VisitProposer
          me={me}
          otherName={otherName}
          action={visitAction}
          hidden={hidden}
          replacing={visits.some((v) => v.status === 'proposed')}
        />
      )}

      {action ? (
        <Composer action={action} hidden={hidden} otherName={otherName} />
      ) : (
        closedNote && <p className={s.closed}>{closedNote}</p>
      )}
    </section>
  );
}

function MessageBubble({ m, me, otherName }: { m: ThreadMessage; me: MessageSender; otherName: string }) {
  return (
    <div className={`${s.msg} ${m.sender === me ? s.mine : s.theirs}`}>
      {m.photos.length > 0 && (
        <div className={s.photos}>
          {m.photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={s.photo}>
              {/* Signed, short-lived storage URLs: next/image would cache them past expiry. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1} from ${m.sender === me ? 'you' : otherName}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {m.body}
      <span className={s.meta}>
        {m.sender === me ? 'You' : otherName} · {m.when}
      </span>
      {m.moderation === 'held' && (
        <span className={s.held}>Waiting for a moderator — not delivered yet</span>
      )}
      {m.moderation === 'rejected' && (
        <span className={s.rejected}>Not delivered — removed by a moderator</span>
      )}
    </div>
  );
}

type TimelineItem = { kind: 'message'; at: string; m: ThreadMessage } | { kind: 'visit'; at: string; v: ThreadVisit };

/** Messages and visits in the order they happened. */
function timeline(messages: ThreadMessage[], visits: ThreadVisit[]): TimelineItem[] {
  return [
    ...messages.map((m) => ({ kind: 'message' as const, at: m.createdAt, m })),
    ...visits.map((v) => ({ kind: 'visit' as const, at: v.createdAt, v })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

/** The most photos one message can carry; sq_post_message holds the same line. */
const PHOTOS_MAX = 4;

type Picked = { file: File; preview: string };

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
  // Photos are held here, already downscaled, and added to the form when it
  // is sent — the file input itself has no name, so a phone's 6MB originals
  // never go up the wire.
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [shrinking, setShrinking] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      setText('');
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.preview));
        return [];
      });
    } else if (state.body !== undefined) setText(state.body);
  }, [state]);

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = PHOTOS_MAX - photos.length;
    const chosen = Array.from(list).slice(0, Math.max(0, room));
    setShrinking(true);
    const small = await Promise.all(chosen.map(downscalePhoto));
    setShrinking(false);
    setPhotos((prev) =>
      [...prev, ...small.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, PHOTOS_MAX),
    );
    if (picker.current) picker.current.value = '';
  }

  function remove(i: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, j) => j !== i);
    });
  }

  function send(data: FormData) {
    for (const p of photos) data.append('photos', p.file);
    formAction(data);
  }

  return (
    <form action={send}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <Hidden hidden={hidden} />
      <label className={f.field}>
        <span className={f.label}>Message {otherName}</span>
        <textarea
          className={f.textarea}
          name="body"
          rows={3}
          maxLength={MESSAGE_MAX}
          required={photos.length === 0}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {photos.length > 0 && (
        <ul className={s.picked} aria-label="Photos to send">
          {photos.map((p, i) => (
            <li key={p.preview} className={s.pickedItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`Photo ${i + 1} to send`} />
              <button type="button" className={s.unpick} onClick={() => remove(i)} aria-label={`Remove photo ${i + 1}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={s.actions}>
        <button className={f.btnPrimary} type="submit" disabled={pending || shrinking}>
          {pending ? 'Sending…' : 'Send'}
        </button>
        {photos.length < PHOTOS_MAX && (
          <label className={s.addPhoto}>
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className={s.fileInput}
              onChange={(e) => pick(e.target.files)}
              disabled={pending}
            />
            {shrinking ? 'Adding…' : photos.length > 0 ? 'Add another photo' : 'Add photos'}
          </label>
        )}
      </div>
    </form>
  );
}
