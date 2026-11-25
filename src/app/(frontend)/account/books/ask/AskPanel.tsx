'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import type { TokenBalance } from '@/lib/books/askTokens';
import type { AskActionView } from '@/lib/books/askActions';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';
import { cancelAskActionAction, confirmAskActionAction } from './actions';

/** One question and its answer, with any changes the answer prepared. */
export type PastTurn = { id: number; question: string; answer: string; at: string; actions: AskActionView[] };
/** A conversation: a question and the follow-ups asked of it, oldest first. */
export type PastThread = { turns: PastTurn[] };

type Turn = {
  key: number;
  id: number | null;
  question: string;
  answer: string;
  status: string | null;
  error: string | null;
  done: boolean;
  at: string | null;
  actions: AskActionView[];
};
type Thread = { key: number; earlier: boolean; turns: Turn[] };

const BOOKS_EXAMPLES = ['How much profit have I made this year?', 'Who owes me money?', 'Record £40 of diesel paid today'];
const WORK_EXAMPLES = ['How many Emmerdale jobs did I win this year?', 'How many jobs have I priced in the last 3 months?'];
const DROPPED = 'The connection dropped. If the answer was finished it will be here when you reload.';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

function balanceLine(b: TokenBalance): string {
  if (b.total === 0) return 'You have no tokens left.';
  const parts = [`${b.total} token${b.total === 1 ? '' : 's'} left`];
  if (b.free > 0 && b.freeExpires && b.kept > 0) parts.push(`${b.free} free, to use by ${day(b.freeExpires)}`);
  else if (b.free > 0 && b.freeExpires) parts.push(`free, to use by ${day(b.freeExpires)}`);
  return parts.join(' · ');
}

/** A change Ask has prepared: what it will do, and Confirm / Don't. Nothing is recorded until Confirm. */
function ActionCard({ action, onChange }: { action: AskActionView; onChange: (a: AskActionView) => void }) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(which: 'confirm' | 'cancel') {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      const res = await (which === 'confirm' ? confirmAskActionAction(action.id) : cancelAskActionAction(action.id));
      if (res.ok) onChange(res.action);
      else setError(res.error);
    } catch {
      setError('That didn’t go through. Check your signal, then reload before trying again.');
    } finally {
      setBusy(null);
    }
  }

  const problem = error ?? (action.status === 'pending' ? action.error : null);
  return (
    <div className={s.askAction} data-status={action.status}>
      <p className={s.askActionTitle}>{action.title}</p>
      {action.lines.length > 0 && (
        <ul>
          {action.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {problem && (
        <p className={s.askError} role="alert">
          {problem}
        </p>
      )}
      {action.status === 'pending' && (
        <div className={s.askActionBar}>
          <button type="button" className={f.btnPrimary} disabled={busy !== null} onClick={() => void act('confirm')}>
            {busy === 'confirm' ? 'Recording…' : 'Confirm'}
          </button>
          <button type="button" className={f.btnGhost} disabled={busy !== null} onClick={() => void act('cancel')}>
            Don’t
          </button>
          <span className={s.askActionNote}>Nothing changes until you confirm.</span>
        </div>
      )}
      {action.status === 'done' && (
        <p className={s.askActionDone}>
          ✓ {action.message ?? 'Done.'}{' '}
          {action.href && (
            <Link href={action.href} prefetch={false}>
              Open
            </Link>
          )}
        </p>
      )}
      {action.status === 'cancelled' && <p className={s.askActionNote}>Not done.</p>}
      {action.status === 'running' && (
        <p className={s.askActionNote}>
          {action.stuck ? 'We couldn’t tell whether this went through. Check your books before asking for it again.' : 'Being recorded…'}
        </p>
      )}
    </div>
  );
}

/**
 * The question box, the top-up offer (passed in by the page), then the
 * conversations: this sitting's first, earlier ones underneath. Any answer
 * can be asked about further, and changes an answer prepared wait here for
 * a Confirm.
 */
export function AskPanel({ balance: initial, hasBooks, past, children }: { balance: TokenBalance; hasBooks: boolean; past: PastThread[]; children?: ReactNode }) {
  const nextKey = useRef(1);
  const [balance, setBalance] = useState(initial);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>(() =>
    past.map((t) => ({
      key: nextKey.current++,
      earlier: true,
      turns: t.turns.map((p) => ({ key: nextKey.current++, id: p.id, question: p.question, answer: p.answer, status: null, error: null, done: true, at: p.at, actions: p.actions })),
    })),
  );
  /** The conversation whose follow-up box is open, and what's typed in it. */
  const [open, setOpen] = useState<number | null>(null);
  const [more, setMore] = useState('');
  const [moreNotice, setMoreNotice] = useState<string | null>(null);

  const patch = (key: number, change: (t: Turn) => Turn) =>
    setThreads((list) => list.map((th) => (th.turns.some((t) => t.key === key) ? { ...th, turns: th.turns.map((t) => (t.key === key ? change(t) : t)) } : th)));

  /** Ask a new question, or (with `threadKey`) a follow-up in that conversation. True when it was sent. */
  async function ask(text: string, threadKey?: number): Promise<boolean> {
    const q = text.trim();
    if (!q || busy) return false;
    const thread = threadKey === undefined ? null : threads.find((t) => t.key === threadKey);
    const follow = thread ? ([...thread.turns].reverse().find((t) => t.id !== null && !t.error)?.id ?? null) : null;
    if (thread && follow === null) return false;
    const say = thread ? setMoreNotice : setNotice;
    setBusy(true);
    setNotice(null);
    setMoreNotice(null);
    const key = nextKey.current++;
    let sent = false;
    try {
      const res = await fetch('/api/books/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, follow }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string; balance?: TokenBalance } | null;
        if (body?.balance) setBalance(body.balance);
        say(body?.error ?? 'Ask isn’t working just now. Try again in a minute.');
        return false;
      }
      sent = true;
      const turn: Turn = { key, id: null, question: q, answer: '', status: 'Thinking…', error: null, done: false, at: null, actions: [] };
      if (thread) setThreads((list) => list.map((t) => (t.key === thread.key ? { ...t, turns: [...t.turns, turn] } : t)));
      else setThreads((list) => [{ key: nextKey.current++, earlier: false, turns: [turn] }, ...list]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const e = JSON.parse(line) as { t: string; text?: string; id?: number; answer?: string; message?: string; balance?: TokenBalance; actions?: AskActionView[]; withdrawn?: number[] };
          if (e.t === 'delta') patch(key, (x) => ({ ...x, answer: x.answer + (e.text ?? ''), status: null }));
          else if (e.t === 'reset') patch(key, (x) => ({ ...x, answer: '' }));
          else if (e.t === 'status') patch(key, (x) => ({ ...x, status: e.text ?? null }));
          else if (e.t === 'done') {
            finished = true;
            patch(key, (x) => ({ ...x, id: e.id ?? null, answer: e.answer ?? x.answer, status: null, done: true, actions: e.actions ?? [] }));
            // Earlier changes this answer took back are no longer on offer.
            const gone = new Set(e.withdrawn ?? []);
            if (gone.size) {
              setThreads((list) =>
                list.map((th) => ({ ...th, turns: th.turns.map((t) => ({ ...t, actions: t.actions.map((a) => (gone.has(a.id) && a.status === 'pending' ? { ...a, status: 'cancelled' as const, error: null } : a)) })) })),
              );
            }
            if (e.balance) setBalance(e.balance);
          } else if (e.t === 'error') {
            finished = true;
            patch(key, (x) => ({ ...x, answer: '', status: null, error: e.message ?? 'Ask couldn’t answer just now.', done: true }));
            if (e.balance) setBalance(e.balance);
          }
        }
      }
      if (!finished) patch(key, (x) => ({ ...x, status: null, done: true, error: DROPPED }));
    } catch {
      if (sent) patch(key, (x) => (x.done ? x : { ...x, status: null, done: true, error: DROPPED }));
      else say('The connection dropped. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
    return sent;
  }

  async function askNew(text: string) {
    if (await ask(text)) setQuestion('');
  }
  async function askMore(threadKey: number) {
    if (await ask(more, threadKey)) {
      setMore('');
      setOpen(null);
    }
  }

  const examples = hasBooks ? [...BOOKS_EXAMPLES, WORK_EXAMPLES[0]] : WORK_EXAMPLES;
  const empty = balance.total === 0;
  const now = threads.filter((t) => !t.earlier);
  const earlier = threads.filter((t) => t.earlier);

  const conversation = (th: Thread) => {
    const last = th.turns[th.turns.length - 1];
    const canFollow = th.turns.some((t) => t.id !== null && !t.error) && last.done;
    return (
      <li key={th.key}>
        {th.turns.map((t) => (
          <div key={t.key} className={s.askTurn}>
            <p className={s.askQ}>{t.question}</p>
            {t.error ? <p className={s.askError}>{t.error}</p> : t.answer ? <p className={s.askA}>{t.answer}</p> : null}
            {t.status && !t.done && <p className={s.askStatus}>{t.status}</p>}
            {t.actions.map((a) => (
              <ActionCard key={a.id} action={a} onChange={(next) => patch(t.key, (x) => ({ ...x, actions: x.actions.map((y) => (y.id === next.id ? next : y)) }))} />
            ))}
          </div>
        ))}
        {canFollow &&
          (open === th.key ? (
            <form
              className={s.askMore}
              onSubmit={(e) => {
                e.preventDefault();
                void askMore(th.key);
              }}
            >
              <textarea
                className={f.textarea}
                rows={2}
                maxLength={500}
                value={more}
                autoFocus
                aria-label="Your follow-up question"
                onChange={(e) => setMore(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void askMore(th.key);
                  }
                }}
                placeholder="e.g. And the year before? Break that down by month."
                disabled={busy || empty}
              />
              <div className={s.askBar}>
                <button type="submit" className={f.btnPrimary} disabled={busy || empty || more.trim().length < 2}>
                  {busy ? 'Working it out…' : 'Ask'}
                </button>
                <button type="button" className={f.btnGhost} disabled={busy} onClick={() => setOpen(null)}>
                  Close
                </button>
                <span className={s.askBalance}>{empty ? 'You have no tokens left.' : 'Uses one token.'}</span>
              </div>
              {moreNotice && (
                <p className={f.error} role="alert">
                  {moreNotice}
                </p>
              )}
            </form>
          ) : (
            <div className={s.askFollow}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(th.key);
                  setMore('');
                  setMoreNotice(null);
                }}
              >
                Ask more about this
              </button>
              {last.at && <span className={s.askWhen}>{day(last.at)}</span>}
            </div>
          ))}
      </li>
    );
  };

  return (
    <div className={s.ask}>
      <form
        className={s.askForm}
        onSubmit={(e) => {
          e.preventDefault();
          void askNew(question);
        }}
      >
        <label className={f.field}>
          <span className={f.label}>Your question, or something to do</span>
          <textarea
            className={f.textarea}
            rows={2}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void askNew(question);
              }
            }}
            placeholder={hasBooks ? 'e.g. What did I spend on repairs this year? Or: invoice Mrs Field £240 for topping' : 'e.g. How many jobs did I win this year?'}
            disabled={busy || empty}
          />
        </label>
        <div className={s.askBar}>
          <button type="submit" className={f.btnPrimary} disabled={busy || empty || question.trim().length < 3}>
            {busy ? 'Working it out…' : 'Ask'}
          </button>
          <span className={s.askBalance} aria-live="polite">
            {balanceLine(balance)}
          </span>
        </div>
        {notice && (
          <p className={f.error} role="alert">
            {notice}
          </p>
        )}
      </form>

      {/* The top-up offer: always there, so a member can buy before they run out. */}
      {children}

      {now.length === 0 && !empty && (
        <div className={s.askExamples}>
          <span>Try:</span>
          {examples.map((x) => (
            <button key={x} type="button" disabled={busy} onClick={() => void askNew(x)}>
              {x}
            </button>
          ))}
        </div>
      )}

      {now.length > 0 && (
        <ol className={s.askList} aria-live="polite">
          {now.map(conversation)}
        </ol>
      )}

      {!hasBooks && <p className={s.muted}>You haven’t set up your books yet, so Ask can only answer about your Emmerdale work for now.</p>}

      {earlier.length > 0 && (
        <>
          <h2>Earlier answers</h2>
          <ol className={s.askList}>{earlier.map(conversation)}</ol>
        </>
      )}

      <p className={s.askFoot}>
        Answers are worked out from what’s recorded in your books and your Emmerdale account, so they’re only as complete as
        your records. They’re figures and pointers, not tax or financial advice. Ask never changes your books by itself: it
        sets a change up and you confirm it.
      </p>
    </div>
  );
}
