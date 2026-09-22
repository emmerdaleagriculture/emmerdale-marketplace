/** "just now", "3h ago", "2d ago" — computed at render (not live). */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/** "17 Sept" — a deadline stated as a day, where the hour would be noise. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 days left", "closes today", "closed" — invitation/payment deadlines. */
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'closes within the hour';
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day left' : `${days} days left`;
}

/**
 * Day grouping, pinned to London. The server renders in UTC, so through
 * British Summer Time a job entered at 00:30 would otherwise be filed under
 * the previous day — visible and wrong on a list grouped by date.
 */
const LONDON = 'Europe/London';

/** "2026-09-22" in London — the key rows are grouped by. */
export function londonDay(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: LONDON });
}

/** "Today", "Yesterday", "Sat 20 Sept", "Sat 20 Sept 2025" — a day heading. */
export function dayHeading(iso: string): string {
  const day = londonDay(iso);
  const now = Date.now();
  if (day === londonDay(now)) return 'Today';
  if (day === londonDay(now - 86400000)) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: LONDON,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(day.slice(0, 4) === londonDay(now).slice(0, 4) ? {} : { year: 'numeric' }),
  });
}

/** "4h 12m", "3d 2h" — time spent in a state, for the ops board. */
export function dwell(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
