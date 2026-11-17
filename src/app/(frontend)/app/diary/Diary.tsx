'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import type { FormState } from '@/lib/form';
import ui from '../app-ui.module.css';
import { deleteDiaryEntryAction, saveDiaryEntryAction, setDiaryEntryDoneAction } from './actions';
import {
  DETAILS_MAX,
  TITLE_MAX,
  dayLabel,
  monthGrid,
  monthLabel,
  shiftMonth,
  shortTime,
  sortDay,
  type DiaryEntry,
} from './diary';
import s from './diary.module.css';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const EMPTY: FormState = {};

type Props = { month: string; today: string; initialDay: string; entries: DiaryEntry[] };

export function Diary({ month, today, initialDay, entries }: Props) {
  const [day, setDay] = useState(initialDay);
  // null = no form open; 'new' = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [optimistic, setDone] = useOptimistic(entries, (cur, { id, done }: { id: string; done: boolean }) =>
    cur.map((e) => (e.id === id ? { ...e, done } : e)),
  );
  const [, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const grid = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>();
    for (const e of optimistic) m.set(e.entry_date, [...(m.get(e.entry_date) ?? []), e]);
    return m;
  }, [optimistic]);
  const todays = sortDay(byDay.get(day) ?? []);

  function pick(d: string) {
    setDay(d);
    setEditing(null);
    setProblem(null);
    // Keep the day across a refresh or a pull-to-refresh, without a round trip.
    try {
      window.history.replaceState(null, '', `/app/diary?m=${month}&d=${d}`);
    } catch {}
  }

  function toggle(e: DiaryEntry) {
    setProblem(null);
    startTransition(async () => {
      setDone({ id: e.id, done: !e.done });
      const res = await setDiaryEntryDoneAction(e.id, !e.done);
      if (res.error) setProblem(res.error);
    });
  }

  return (
    <>
      <div className={s.cal}>
        <div className={s.calHead}>
          <Link href={`/app/diary?m=${shiftMonth(month, -1)}`} className={s.nav} aria-label="Previous month" replace>
            ‹
          </Link>
          <div className={s.month}>{monthLabel(month)}</div>
          <Link href={`/app/diary?m=${shiftMonth(month, 1)}`} className={s.nav} aria-label="Next month" replace>
            ›
          </Link>
        </div>
        <div className={s.grid} role="grid" aria-label={monthLabel(month)}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} className={s.wd} aria-hidden="true">
              {w}
            </div>
          ))}
          {grid.map((c) => {
            const items = byDay.get(c.day) ?? [];
            const open = items.filter((e) => !e.done).length;
            const cls = [
              s.cell,
              c.inMonth ? '' : s.out,
              c.day === today ? s.today : '',
              c.day === day ? s.selected : '',
            ]
              .filter(Boolean)
              .join(' ');
            const label = `${dayLabel(c.day, today)}${items.length ? `, ${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : ''}`;
            return c.inMonth ? (
              <button key={c.day} type="button" className={cls} onClick={() => pick(c.day)} aria-label={label} aria-pressed={c.day === day}>
                <span>{Number(c.day.slice(8))}</span>
                {items.length > 0 && <span className={open ? s.dot : `${s.dot} ${s.dotDone}`} aria-hidden="true" />}
              </button>
            ) : (
              <Link
                key={c.day}
                className={cls}
                href={`/app/diary?m=${c.day.slice(0, 7)}&d=${c.day}`}
                aria-label={label}
                replace
              >
                <span>{Number(c.day.slice(8))}</span>
                {items.length > 0 && <span className={s.dot} aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
        {!today.startsWith(month) && (
          <Link href={`/app/diary?m=${today.slice(0, 7)}&d=${today}`} className={s.todayLink} replace>
            Back to today
          </Link>
        )}
      </div>

      <div className={ui.sectionHead}>
        <h2 className={ui.sectionTitle}>{day === today ? `Today · ${dayLabel(day, today)}` : dayLabel(day, today)}</h2>
      </div>

      {problem && <p className={s.error}>{problem}</p>}

      {todays.length === 0 && editing !== 'new' && (
        <div className={ui.card} style={{ color: 'var(--ink-3)', fontSize: 14.5 }}>
          Nothing written for this day.
        </div>
      )}

      {todays.length > 0 && (
        <div className={ui.rows}>
          {todays.map((e) =>
            editing === e.id ? (
              <div key={e.id} className={s.editRow}>
                <EntryForm entry={e} day={day} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <div key={e.id} className={s.entry}>
                <button
                  type="button"
                  className={e.done ? `${s.check} ${s.checkOn}` : s.check}
                  onClick={() => toggle(e)}
                  aria-label={e.done ? `Mark “${e.title}” not done` : `Mark “${e.title}” done`}
                  aria-pressed={e.done}
                >
                  {e.done ? '✓' : ''}
                </button>
                <button type="button" className={s.entryBody} onClick={() => { setEditing(e.id); setProblem(null); }}>
                  <span className={e.done ? `${s.entryTitle} ${s.struck}` : s.entryTitle}>
                    {e.start_time && <span className={s.time}>{shortTime(e.start_time)}</span>}
                    {e.title}
                  </span>
                  {e.details && <span className={s.details}>{e.details}</span>}
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {editing === 'new' ? (
        <div className={ui.card} style={{ marginTop: 12 }}>
          <EntryForm day={day} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          style={{ marginTop: 14 }}
          onClick={() => {
            setEditing('new');
            setProblem(null);
          }}
        >
          + Add to {day === today ? 'today' : dayLabel(day, today).replace(/ \d{4}$/, '')}
        </button>
      )}

      <p className={ui.note} style={{ textAlign: 'center' }}>
        Your diary is private to you. Write anything: jobs, servicing, reminders.
      </p>
    </>
  );
}

/** Add (no entry) or edit (entry) one diary entry. The date can be changed to move it. */
function EntryForm({ entry, day, onDone }: { entry?: DiaryEntry; day: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveDiaryEntryAction, EMPTY);
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className={s.form}>
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <label className={s.field}>
        <span className={s.label}>What</span>
        <input
          className={s.input}
          name="title"
          defaultValue={entry?.title ?? ''}
          maxLength={TITLE_MAX}
          required
          autoFocus={!entry}
          placeholder="e.g. Top 6 acres for Mrs Hughes"
          autoComplete="off"
        />
      </label>
      <div className={s.pair}>
        <label className={s.field}>
          <span className={s.label}>Day</span>
          <input className={s.input} type="date" name="entry_date" defaultValue={entry?.entry_date ?? day} required />
        </label>
        <label className={s.field}>
          <span className={s.label}>Time (optional)</span>
          <input className={s.input} type="time" name="start_time" defaultValue={shortTime(entry?.start_time ?? null) ?? ''} />
        </label>
      </div>
      <label className={s.field}>
        <span className={s.label}>Notes (optional)</span>
        <textarea
          className={s.textarea}
          name="details"
          defaultValue={entry?.details ?? ''}
          maxLength={DETAILS_MAX}
          rows={3}
          placeholder="Anything else: gate code, what to bring, who to ring"
        />
      </label>

      {(state.error || delError) && <p className={s.error}>{state.error ?? delError}</p>}

      <div className={s.actions}>
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending || deleting}>
          {pending ? 'Saving…' : entry ? 'Save' : 'Add'}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onDone} disabled={pending || deleting}>
          Cancel
        </button>
      </div>
      {entry &&
        (confirming ? (
          <div className={s.confirm}>
            <span>Delete this entry?</span>
            <button
              type="button"
              className={s.deleteBtn}
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const res = await deleteDiaryEntryAction(entry.id);
                  if (res.error) setDelError(res.error);
                  else onDone();
                })
              }
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" className={s.linkBtn} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className={s.deleteBtn} onClick={() => setConfirming(true)}>
            Delete entry
          </button>
        ))}
    </form>
  );
}
