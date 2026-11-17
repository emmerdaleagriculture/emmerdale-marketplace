/**
 * The Diary's date arithmetic, client-safe and pure. Days are plain
 * "YYYY-MM-DD" strings in UK local time (an entry is written against a day,
 * not an instant), so nothing here goes near a Date's time zone except
 * `todayInLondon`.
 */

export const TITLE_MAX = 200;
export const DETAILS_MAX = 4000;

export type DiaryEntry = {
  id: string;
  entry_date: string;
  start_time: string | null;
  title: string;
  details: string | null;
  done: boolean;
};

export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
}

export function todayInLondon(now: number | Date = Date.now()): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

const pad = (n: number) => String(n).padStart(2, '0');

function dayOf(y: number, m0: number, d: number): string {
  const dt = new Date(Date.UTC(y, m0, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** "2026-11" → "2026-12" (step +1) or "2026-10" (step -1). */
export function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + step, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
}

/** "November 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The calendar's cells: whole weeks, Monday first, from the Monday on or
 * before the 1st to the Sunday on or after the last day. Days outside the
 * month are included (greyed in the UI) so the grid is always rectangular.
 */
export function monthGrid(month: string): { day: string; inMonth: boolean }[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const d = i - lead + 1;
    cells.push({ day: dayOf(y, m - 1, d), inMonth: d >= 1 && d <= daysInMonth });
  }
  return cells;
}

/** "Tuesday 17 November" (year added when it isn't this year). */
export function dayLabel(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** "09:30:00" → "09:30". */
export function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

/** Within a day: timed entries in time order, then untimed in the order written. */
export function sortDay(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return 0;
  });
}
