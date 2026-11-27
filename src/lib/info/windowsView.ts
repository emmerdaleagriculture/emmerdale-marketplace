import type { Level, Rated, Window } from './windows';

/**
 * Rated slots arranged for the page: one block per UK day, the daylight
 * hours folded into runs that share a rating ("7am to 11am: good").
 */

const TZ = 'Europe/London';
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: true });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' });

/** "7am", "12pm". */
export function hourLabel(iso: string): string {
  return hourFmt.format(new Date(iso)).replace(/\s/g, '').toLowerCase();
}

export function dayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

/** "Today", "Tomorrow", then "Monday 30 Nov". */
export function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Today';
  if (key === dayKey(new Date(now.getTime() + 86400000).toISOString())) return 'Tomorrow';
  return dayFmt.format(new Date(iso));
}

export type Run = {
  level: Level;
  start: string;
  end: string;
  reasons: string[];
  boomMph: [number, number];
  tempC: [number, number];
  rainMm: number;
};

export type Day = { key: string; label: string; detailed: boolean; slots: Rated[]; runs: Run[] };

const endOf = (r: Rated) => new Date(new Date(r.t).getTime() + r.hours * 3600000).toISOString();
/** Two reasons are the same thing if they differ only in their figures. */
const reasonKey = (text: string) => text.replace(/[\d.]+/g, '#');

function runsOf(slots: Rated[]): Run[] {
  const runs: Run[] = [];
  let keys = new Set<string>();
  for (const s of slots) {
    if (!s.daylight) continue;
    const last = runs[runs.length - 1];
    if (last && last.level === s.level && new Date(last.end).getTime() === new Date(s.t).getTime()) {
      last.end = endOf(s);
      last.boomMph = [Math.min(last.boomMph[0], s.boomMph), Math.max(last.boomMph[1], s.boomMph)];
      last.tempC = [Math.min(last.tempC[0], s.tempC), Math.max(last.tempC[1], s.tempC)];
      last.rainMm += s.rainMm;
      for (const r of s.reasons) {
        if (!keys.has(reasonKey(r))) {
          keys.add(reasonKey(r));
          last.reasons.push(r);
        }
      }
    } else {
      keys = new Set(s.reasons.map(reasonKey));
      runs.push({
        level: s.level,
        start: s.t,
        end: endOf(s),
        reasons: [...s.reasons],
        boomMph: [s.boomMph, s.boomMph],
        tempC: [s.tempC, s.tempC],
        rainMm: s.rainMm,
      });
    }
  }
  return runs;
}

export function groupDays(rated: Rated[], now: Date): Day[] {
  const days: Day[] = [];
  for (const r of rated) {
    const key = dayKey(r.t);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabel(r.t, now), detailed: true, slots: [], runs: [] };
      days.push(day);
    }
    day.slots.push(r);
  }
  for (const d of days) {
    d.detailed = d.slots.every((s) => s.hours === 1);
    d.runs = runsOf(d.slots);
  }
  return days;
}

/** "today, 1pm to 4pm", "Monday, 7am to 11am". */
export function windowLabel(w: Window, now: Date): string {
  const key = dayKey(w.start);
  const day =
    key === dayKey(now.toISOString())
      ? 'today'
      : key === dayKey(new Date(now.getTime() + 86400000).toISOString())
        ? 'tomorrow'
        : weekdayFmt.format(new Date(w.start));
  return `${day}, ${hourLabel(w.start)} to ${hourLabel(w.end)}`;
}

export function span(pair: [number, number], unit: string): string {
  const [a, b] = [Math.round(pair[0]), Math.round(pair[1])];
  return a === b ? `${a}${unit}` : `${a} to ${b}${unit}`;
}
