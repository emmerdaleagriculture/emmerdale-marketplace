'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useLayoutEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
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

export type DiaryView = 'day' | 'week' | 'month';

/** How far a sideways swipe on the calendar must travel to turn the page. */
const STEP_AT = 50;
/** A quick flick this fast (px/ms) turns it even short of that. */
const FLICK = 0.45;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const OUT_MS = 170;
const IN_MS = 240;

/**
 * A turn in progress: where the next page comes in from. Module-level, as a
 * new month remounts the Diary (page.tsx keys it by month).
 */
let turning: { to: string; from: number; timer: ReturnType<typeof setTimeout> } | null = null;

/**
 * Turn the calendar like a page: swipe the card sideways (or tap an arrow)
 * and the month or week inside slides off that side, then the next one
 * slides in from the other. Right to left is forward, as the arrows are laid
 * out. The card carries data-no-swipe so the app's tab swipe leaves it
 * alone; vertical drags are left to the page.
 *
 * `page` names what is showing (a month, or a week's Monday), and
 * `pageAfter` the one a turn will show: when that arrives, it slides in.
 * Anything else (the Diary left and opened again) just shows. A month is a fetch, so the
 * pane waits off to the side until it arrives.
 */
function useCalendarPager(page: string, pageAfter: (dir: -1 | 1) => string, onStep: (dir: -1 | 1) => void) {
  const step = useRef(onStep);
  step.current = onStep;
  const pane = useRef<HTMLDivElement>(null);
  const st = useRef({ x: 0, y: 0, lastX: 0, lastT: 0, v: 0, tracking: false, swiping: false, dx: 0 });

  const set = (x: number, ms: number) => {
    const n = pane.current;
    if (!n) return;
    n.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
    n.style.transform = x ? `translateX(${x}px)` : '';
  };

  // The next page is showing (or this Diary is the new month): bring it in
  // from the side, placed there before it is painted.
  useLayoutEffect(() => {
    const t = turning;
    if (!t) return;
    clearTimeout(t.timer);
    turning = null;
    const n = pane.current;
    if (!n || page !== t.to) return;
    set(t.from, 0);
    void n.offsetWidth;
    set(0, IN_MS);
  }, [page]);

  function turn(dir: -1 | 1) {
    if (turning) return;
    const w = pane.current?.parentElement?.clientWidth ?? window.innerWidth;
    set(-dir * w, OUT_MS);
    const timer = setTimeout(() => {
      // Nothing came (offline, an error): put this page back.
      if (turning?.timer === timer) {
        turning = null;
        set(0, OUT_MS);
      }
    }, 12000);
    turning = { to: pageAfter(dir), from: dir * w, timer };
    // Change what is showing once it is off the side, not while it leaves.
    setTimeout(() => step.current(dir), OUT_MS);
  }

  const bind = {
    'data-no-swipe': '',
    onTouchStart: (e: React.TouchEvent) => {
      const s = st.current;
      s.tracking = e.touches.length === 1 && !turning;
      s.swiping = false;
      s.dx = s.v = 0;
      if (!s.tracking) return;
      s.x = s.lastX = e.touches[0].clientX;
      s.y = e.touches[0].clientY;
      s.lastT = e.timeStamp;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = st.current;
      if (!s.tracking) return;
      const x = e.touches[0].clientX;
      const mx = x - s.x;
      const my = e.touches[0].clientY - s.y;
      if (!s.swiping) {
        if (Math.abs(my) > 10 && Math.abs(my) * 1.2 > Math.abs(mx)) {
          s.tracking = false;
          return;
        }
        if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.5) return;
        s.swiping = true;
      }
      const dt = e.timeStamp - s.lastT;
      if (dt > 0) s.v = (x - s.lastX) / dt;
      s.lastX = x;
      s.lastT = e.timeStamp;
      s.dx = mx;
      set(mx, 0);
    },
    onTouchEnd: () => {
      const s = st.current;
      const { dx, v, swiping } = s;
      s.tracking = s.swiping = false;
      s.dx = 0;
      if (!swiping) return;
      const flick = Math.abs(dx) > 20 && Math.abs(v) > FLICK && Math.sign(v) === Math.sign(dx);
      if (dx <= -STEP_AT || (flick && dx < 0)) turn(1);
      else if (dx >= STEP_AT || (flick && dx > 0)) turn(-1);
      else set(0, OUT_MS);
    },
    onTouchCancel: () => {
      st.current.tracking = st.current.swiping = false;
      if (!turning) set(0, OUT_MS);
    },
  };

  return { bind, pane, turn };
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
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === 'week' || v === 'day') setView(v);
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
  const href = (d: string, v: DiaryView = view) => `/app/diary?m=${d.slice(0, 7)}&d=${d}${v === 'month' ? '' : `&v=${v}`}`;

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

  const prevMonth = `/app/diary?m=${shiftMonth(month, -1)}&v=month`;
  const nextMonth = `/app/diary?m=${shiftMonth(month, 1)}&v=month`;
  // Months are fetched: ask for the neighbours early so a turn is quick.
  useEffect(() => {
    router.prefetch(prevMonth);
    router.prefetch(nextMonth);
  }, [router, prevMonth, nextMonth]);

  const pager = useCalendarPager(
    view !== 'month' ? week[0] : month,
    (dir) => (view !== 'month' ? addDays(week[0], dir * 7) : shiftMonth(month, dir)),
    (dir) => {
      if (view !== 'month') pick(addDays(day, dir * 7));
      else startNav(() => router.replace(dir < 0 ? prevMonth : nextMonth));
    },
  );

  const backToToday = view !== 'month' ? !week.includes(today) : !today.startsWith(month);

  return (
    <>
      <div className={s.switcher} role="tablist" aria-label="Diary view">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? `${s.seg} ${s.segOn}` : s.seg} onClick={() => switchView(v)}>
            {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      {view === 'month' ? (
        <div className={s.cal} {...pager.bind}>
          <div ref={pager.pane}>
          <div className={s.calHead}>
            <button type="button" className={s.nav} aria-label="Previous month" disabled={navigating} onClick={() => pager.turn(-1)}>
              ‹
            </button>
            <div className={s.month}>{monthLabel(month)}</div>
            <button type="button" className={s.nav} aria-label="Next month" disabled={navigating} onClick={() => pager.turn(1)}>
              ›
            </button>
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
        </div>
      ) : view === 'day' ? (
        <div className={s.strip} {...pager.bind}>
          <div ref={pager.pane}>
            <div className={s.calHead}>
              <button type="button" className={s.nav} aria-label="Previous week" disabled={navigating} onClick={() => pager.turn(-1)}>
                ‹
              </button>
              <div className={s.month}>{weekLabel(week)}</div>
              <button type="button" className={s.nav} aria-label="Next week" disabled={navigating} onClick={() => pager.turn(1)}>
                ›
              </button>
            </div>
            {/* The week as a strip of days: tap one to see it below. */}
            <div className={s.stripDays}>
              {week.map((d, i) => {
                const items = byDay.get(d) ?? [];
                const cls = [s.sDay, d === today ? s.sToday : '', d === day ? s.sSel : ''].filter(Boolean).join(' ');
                return (
                  <button
                    key={d}
                    type="button"
                    className={cls}
                    onClick={() => pick(d)}
                    aria-label={`${dayLabel(d, today)}${items.length ? `, ${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : ''}`}
                    aria-pressed={d === day}
                  >
                    <span className={s.sName}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
                    <span className={s.sNum}>{Number(d.slice(8))}</span>
                    <span className={s.sDots} aria-hidden="true">
                      {items.slice(0, 3).map((e) => (
                        <span key={e.id} className={e.done ? `${s.sDot} ${s.sDotDone}` : s.sDot} />
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
        </div>
      ) : (
        <div className={s.weekWrap} {...pager.bind}>
          <div ref={pager.pane}>
          <div className={s.calHead}>
            <button type="button" className={s.nav} aria-label="Previous week" disabled={navigating} onClick={() => pager.turn(-1)}>
              ‹
            </button>
            <div style={{ textAlign: 'center' }}>
              <div className={s.month}>{weekLabel(week)}</div>
              <div className={s.weekNo}>Week {isoWeek(day)}</div>
            </div>
            <button type="button" className={s.nav} aria-label="Next week" disabled={navigating} onClick={() => pager.turn(1)}>
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

      <div id="diary-add" className={ui.card} style={{ marginTop: 12, scrollMarginTop: 12 }}>
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
