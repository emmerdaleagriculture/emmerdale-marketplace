'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/lib/form';
import ui from '../app-ui.module.css';
import { deleteDiaryEntryAction, saveDiaryEntryAction, setDiaryEntryDoneAction } from './actions';
import {
  DETAILS_MAX,
  TITLE_MAX,
  addDays,
  dayLabel,
  isoWeek,
  monthGrid,
  monthLabel,
  shiftMonth,
  shortTime,
  sortDay,
  weekLabel,
  weekOf,
  type DiaryEntry,
} from './diary';
import s from './diary.module.css';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const EMPTY: FormState = {};
const VIEW_KEY = 'diary-view';

export type DiaryView = 'month' | 'week';

/** How far a sideways swipe on the calendar must travel to step. */
const STEP_AT = 50;

/**
 * Swipe the calendar card sideways to step a month (or week): right to left
 * for the next, left to right for the one before. The card carries
 * data-no-swipe so the app's tab swipe leaves it alone, and follows the
 * finger a little. Vertical drags are left to the page.
 */
function useCalendarSwipe(onStep: (dir: -1 | 1) => void) {
  const step = useRef(onStep);
  step.current = onStep;
  const st = useRef({ x: 0, y: 0, tracking: false, swiping: false, dx: 0 });
  const el = useRef<HTMLDivElement>(null);

  const shift = (d: number, dragging: boolean) => {
    const n = el.current;
    if (!n) return;
    n.style.transition = dragging ? 'none' : 'transform 0.2s ease';
    n.style.transform = d ? `translateX(${d * 0.3}px)` : '';
  };

  return {
    ref: el,
    'data-no-swipe': '',
    onTouchStart: (e: React.TouchEvent) => {
      const s = st.current;
      s.tracking = e.touches.length === 1;
      s.swiping = false;
      s.dx = 0;
      if (!s.tracking) return;
      s.x = e.touches[0].clientX;
      s.y = e.touches[0].clientY;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = st.current;
      if (!s.tracking) return;
      const mx = e.touches[0].clientX - s.x;
      const my = e.touches[0].clientY - s.y;
      if (!s.swiping) {
        if (Math.abs(my) > 10 && Math.abs(my) * 1.2 > Math.abs(mx)) {
          s.tracking = false;
          return;
        }
        if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.5) return;
        s.swiping = true;
      }
      s.dx = mx;
      shift(mx, true);
    },
    onTouchEnd: () => {
      const s = st.current;
      const dx = s.dx;
      const was = s.swiping;
      s.tracking = s.swiping = false;
      s.dx = 0;
      if (!was) return;
      shift(0, false);
      if (dx <= -STEP_AT) step.current(1);
      else if (dx >= STEP_AT) step.current(-1);
    },
    onTouchCancel: () => {
      st.current.tracking = st.current.swiping = false;
      shift(0, false);
    },
  };
}
type Props = { month: string; today: string; initialDay: string; initialView: DiaryView | null; entries: DiaryEntry[] };

export function Diary({ month, today, initialDay, initialView, entries }: Props) {
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [view, setView] = useState<DiaryView>(initialView ?? 'month');
  // The id of the entry being edited, if any. Adding needs no switch: the
  // add bar is always there, and tapping into it is enough.
  const [editing, setEditing] = useState<string | null>(null);
  // Bumped after an add (or Cancel) to give the add bar a fresh, folded form.
  const [addKey, setAddKey] = useState(0);
  const [optimistic, setDone] = useOptimistic(entries, (cur, { id, done }: { id: string; done: boolean }) =>
    cur.map((e) => (e.id === id ? { ...e, done } : e)),
  );
  const [, startTransition] = useTransition();
  // A fetch for another month: the arrows wait for it, or a quick second tap
  // would step from the old week.
  const [navigating, startNav] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // No ?v= in the link: open the view this person last chose on this device.
  useEffect(() => {
    if (initialView) return;
    try {
      if (window.localStorage.getItem(VIEW_KEY) === 'week') setView('week');
    } catch {}
  }, [initialView]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const week = useMemo(() => weekOf(day), [day]);
  const byDay = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>();
    for (const e of optimistic) m.set(e.entry_date, [...(m.get(e.entry_date) ?? []), e]);
    return m;
  }, [optimistic]);
  const todays = sortDay(byDay.get(day) ?? []);
  const href = (d: string, v: DiaryView = view) => `/app/diary?m=${d.slice(0, 7)}&d=${d}${v === 'week' ? '&v=week' : ''}`;

  // Keep the day and view across a refresh or a pull-to-refresh, without a round trip.
  function remember(d: string, v: DiaryView) {
    try {
      window.history.replaceState(null, '', href(d, v));
    } catch {}
  }

  function pick(d: string, scroll = false) {
    setEditing(null);
    setProblem(null);
    // Entries are loaded a month (in whole weeks) at a time, which always
    // covers the selected day's week; another month is a fetch.
    if (!monthGrid(month).some((c) => c.day === d) || (view === 'month' && !d.startsWith(month))) {
      startNav(() => router.replace(href(d)));
      return;
    }
    setDay(d);
    remember(d, view);
    if (scroll) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function switchView(v: DiaryView) {
    setView(v);
    remember(day, v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
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

  const swipe = useCalendarSwipe((dir) => {
    if (navigating) return;
    if (view === 'week') pick(addDays(day, dir * 7));
    else startNav(() => router.replace(`/app/diary?m=${shiftMonth(month, dir)}&v=month`));
  });

  const backToToday = view === 'week' ? !week.includes(today) : !today.startsWith(month);

  return (
    <>
      <div className={s.switcher} role="tablist" aria-label="Diary view">
        {(['month', 'week'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? `${s.seg} ${s.segOn}` : s.seg} onClick={() => switchView(v)}>
            {v === 'month' ? 'Month' : 'Week'}
          </button>
        ))}
      </div>

      {view === 'month' ? (
        <div className={s.cal} {...swipe}>
          <div className={s.calHead}>
            <Link href={`/app/diary?m=${shiftMonth(month, -1)}&v=month`} className={s.nav} aria-label="Previous month" replace>
              ‹
            </Link>
            <div className={s.month}>{monthLabel(month)}</div>
            <Link href={`/app/diary?m=${shiftMonth(month, 1)}&v=month`} className={s.nav} aria-label="Next month" replace>
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
              const cls = [s.cell, c.inMonth ? '' : s.out, c.day === today ? s.today : '', c.day === day ? s.selected : '']
                .filter(Boolean)
                .join(' ');
              const label = `${dayLabel(c.day, today)}${items.length ? `, ${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : ''}`;
              return (
                <button key={c.day} type="button" className={cls} onClick={() => pick(c.day)} aria-label={label} aria-pressed={c.day === day}>
                  <span>{Number(c.day.slice(8))}</span>
                  {items.length > 0 && <span className={open ? s.dot : `${s.dot} ${s.dotDone}`} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {backToToday && (
            <Link href={href(today)} className={s.todayLink} replace>
              Back to today
            </Link>
          )}
        </div>
      ) : (
        <div className={s.weekWrap} {...swipe}>
          <div className={s.calHead}>
            <button type="button" className={s.nav} aria-label="Previous week" disabled={navigating} onClick={() => pick(addDays(day, -7))}>
              ‹
            </button>
            <div style={{ textAlign: 'center' }}>
              <div className={s.month}>{weekLabel(week)}</div>
              <div className={s.weekNo}>Week {isoWeek(day)}</div>
            </div>
            <button type="button" className={s.nav} aria-label="Next week" disabled={navigating} onClick={() => pick(addDays(day, 7))}>
              ›
            </button>
          </div>
          {/* A week to view: Monday to Wednesday down the left, Thursday
              and Friday on the right, the weekend sharing the last slot. */}
          <div className={s.week}>
            {week.map((d, i) => {
              const items = sortDay(byDay.get(d) ?? []);
              const [, , dd] = d.split('-');
              const cls = [s.wday, i >= 5 ? s.wkend : '', d === today ? s.wToday : '', d === day ? s.wSel : ''].filter(Boolean).join(' ');
              return (
                <button
                  key={d}
                  type="button"
                  className={cls}
                  style={{ gridArea: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'][i] }}
                  onClick={() => pick(d, true)}
                  aria-label={`${dayLabel(d, today)}${items.length ? `, ${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : ''}`}
                  aria-pressed={d === day}
                >
                  <span className={s.wHead}>
                    <span className={s.wName}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
                    <span className={s.wNum}>{Number(dd)}</span>
                  </span>
                  <span className={s.wLines}>
                    {items.map((e) => (
                      <span key={e.id} className={e.done ? `${s.wItem} ${s.struck}` : s.wItem}>
                        {e.start_time && <span className={s.time}>{shortTime(e.start_time)}</span>}
                        {e.title}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {backToToday && (
            <button type="button" className={s.todayLink} disabled={navigating} onClick={() => pick(today)}>
              Back to this week
            </button>
          )}
        </div>
      )}

      <div ref={panel} className={ui.sectionHead} style={{ scrollMarginTop: 12 }}>
        <h2 className={ui.sectionTitle}>{day === today ? `Today · ${dayLabel(day, today)}` : dayLabel(day, today)}</h2>
      </div>

      {problem && <p className={s.error}>{problem}</p>}

      {todays.length === 0 && (
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

      <div className={ui.card} style={{ marginTop: 12 }}>
        <EntryForm
          key={`${day}:${addKey}`}
          day={day}
          addLabel={day === today ? 'today' : dayLabel(day, today).replace(/ \d{4}$/, '')}
          onDone={() => setAddKey((k) => k + 1)}
          onOpen={() => setProblem(null)}
        />
      </div>

      <p className={ui.note} style={{ textAlign: 'center' }}>
        Your diary is private to you. Write anything: jobs, servicing, reminders.
      </p>
    </>
  );
}

/**
 * Add (no entry) or edit (entry) one diary entry. Editing can change the
 * date to move it. Adding starts folded to the one text bar, always on the
 * day panel: tapping into it opens time and notes, and Enter alone adds.
 */
function EntryForm({
  entry,
  day,
  addLabel,
  onDone,
  onOpen,
}: {
  entry?: DiaryEntry;
  day: string;
  addLabel?: string;
  onDone: () => void;
  onOpen?: () => void;
}) {
  const [state, action, pending] = useActionState(saveDiaryEntryAction, EMPTY);
  const [open, setOpen] = useState(Boolean(entry));
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className={s.form}
      onFocus={() => {
        if (open) return;
        setOpen(true);
        onOpen?.();
      }}
    >
      {entry && <input type="hidden" name="id" value={entry.id} />}
      {!entry && <input type="hidden" name="entry_date" value={day} />}
      <label className={s.field}>
        <span className={open ? s.label : s.srOnly}>What</span>
        <input
          className={s.input}
          name="title"
          defaultValue={entry?.title ?? ''}
          maxLength={TITLE_MAX}
          required
          placeholder={entry ? 'e.g. Top 6 acres for Mrs Hughes' : `Add to ${addLabel ?? 'this day'}…`}
          autoComplete="off"
        />
      </label>
      {open && (
        <>
          <div className={entry ? s.pair : undefined}>
            {entry && (
              <label className={s.field}>
                <span className={s.label}>Day</span>
                <input className={s.input} type="date" name="entry_date" defaultValue={entry.entry_date} required />
              </label>
            )}
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
        </>
      )}

      {(state.error || delError) && <p className={s.error}>{state.error ?? delError}</p>}

      {open && (
        <div className={s.actions}>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending || deleting}>
            {pending ? 'Saving…' : entry ? 'Save' : 'Add'}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onDone} disabled={pending || deleting}>
            Cancel
          </button>
        </div>
      )}
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
