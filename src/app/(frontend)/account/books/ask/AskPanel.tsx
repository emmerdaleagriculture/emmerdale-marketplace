'use client';

import { useRef, useState } from 'react';
import type { TokenBalance } from '@/lib/books/askTokens';
import f from '@/components/forms/forms.module.css';
import s from '../books.module.css';

type Past = { id: number; question: string; answer: string; at: string };
type Exchange = { key: number; id: number | null; question: string; answer: string; status: string | null; error: string | null; done: boolean };

const BOOKS_EXAMPLES = ['How much profit have I made this year?', 'What did I spend on fuel last month?', 'Who owes me money?'];
const WORK_EXAMPLES = ['How many Emmerdale jobs did I win this year?', 'How many jobs have I priced in the last 3 months?'];

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

function balanceLine(b: TokenBalance): string {
  if (b.total === 0) return 'You have no tokens left.';
  const parts = [`${b.total} token${b.total === 1 ? '' : 's'} left`];
  if (b.free > 0 && b.freeExpires && b.kept > 0) parts.push(`${b.free} free, to use by ${day(b.freeExpires)}`);
  else if (b.free > 0 && b.freeExpires) parts.push(`free, to use by ${day(b.freeExpires)}`);
  return parts.join(' · ');
}

/** The question box, the answers from this sitting (newest first) and earlier ones underneath. */
export function AskPanel({ balance: initial, hasBooks, past }: { balance: TokenBalance; hasBooks: boolean; past: Past[] }) {
  const [balance, setBalance] = useState(initial);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [asked, setAsked] = useState<Exchange[]>([]);
  const nextKey = useRef(1);

  const patch = (key: number, change: (e: Exchange) => Exchange) => setAsked((list) => list.map((e) => (e.key === key ? change(e) : e)));

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setNotice(null);
    const key = nextKey.current++;
    const context = asked.filter((e) => e.id !== null && e.done && !e.error).map((e) => e.id as number).slice(0, 3).reverse();
    try {
      const res = await fetch('/api/books/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string; balance?: TokenBalance } | null;
        if (body?.balance) setBalance(body.balance);
        setNotice(body?.error ?? 'Ask isn’t working just now. Try again in a minute.');
        return;
      }
      setQuestion('');
      setAsked((list) => [{ key, id: null, question: q, answer: '', status: 'Thinking…', error: null, done: false }, ...list]);

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
          const e = JSON.parse(line) as { t: string; text?: string; id?: number; answer?: string; message?: string; balance?: TokenBalance };
          if (e.t === 'delta') patch(key, (x) => ({ ...x, answer: x.answer + (e.text ?? ''), status: null }));
          else if (e.t === 'reset') patch(key, (x) => ({ ...x, answer: '' }));
          else if (e.t === 'status') patch(key, (x) => ({ ...x, status: e.text ?? null }));
          else if (e.t === 'done') {
            finished = true;
            patch(key, (x) => ({ ...x, id: e.id ?? null, answer: e.answer ?? x.answer, status: null, done: true }));
            if (e.balance) setBalance(e.balance);
          } else if (e.t === 'error') {
            finished = true;
            patch(key, (x) => ({ ...x, answer: '', status: null, error: e.message ?? 'Ask couldn’t answer just now.', done: true }));
            if (e.balance) setBalance(e.balance);
          }
        }
      }
      if (!finished) {
        patch(key, (x) => ({ ...x, status: null, done: true, error: 'The connection dropped. If the answer was finished it will be under Earlier answers when you reload.' }));
      }
    } catch {
      setNotice('The connection dropped. Check your signal and try again.');
      patch(key, (x) => (x.done ? x : { ...x, status: null, done: true, error: 'The connection dropped. If the answer was finished it will be under Earlier answers when you reload.' }));
    } finally {
      setBusy(false);
    }
  }

  const examples = hasBooks ? [...BOOKS_EXAMPLES, WORK_EXAMPLES[0]] : WORK_EXAMPLES;
  const empty = balance.total === 0;
  const shownIds = new Set(asked.map((e) => e.id));
  const earlier = past.filter((p) => !shownIds.has(p.id));

  return (
    <div className={s.ask}>
      <form
        className={s.askForm}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label className={f.field}>
          <span className={f.label}>Your question</span>
          <textarea
            className={f.textarea}
            rows={2}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder={hasBooks ? 'e.g. What did I spend on repairs this year?' : 'e.g. How many jobs did I win this year?'}
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

      {asked.length === 0 && !empty && (
        <div className={s.askExamples}>
          <span>Try:</span>
          {examples.map((x) => (
            <button key={x} type="button" disabled={busy} onClick={() => void ask(x)}>
              {x}
            </button>
          ))}
        </div>
      )}

      {asked.length > 0 && (
        <ol className={s.askList} aria-live="polite">
          {asked.map((e) => (
            <li key={e.key}>
              <p className={s.askQ}>{e.question}</p>
              {e.error ? <p className={s.askError}>{e.error}</p> : e.answer ? <p className={s.askA}>{e.answer}</p> : null}
              {e.status && !e.done && <p className={s.askStatus}>{e.status}</p>}
            </li>
          ))}
        </ol>
      )}

      {!hasBooks && <p className={s.muted}>You haven’t set up your books yet, so Ask can only answer about your Emmerdale work for now.</p>}

      {earlier.length > 0 && (
        <>
          <h2>Earlier answers</h2>
          <ol className={s.askList}>
            {earlier.map((p) => (
              <li key={p.id}>
                <p className={s.askQ}>{p.question}</p>
                <p className={s.askA}>{p.answer}</p>
                <p className={s.askWhen}>{day(p.at)}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className={s.askFoot}>
        Answers are worked out from what’s recorded in your books and your Emmerdale account, so they’re only as complete as
        your records. They’re figures and pointers, not tax or financial advice.
      </p>
    </div>
  );
}
