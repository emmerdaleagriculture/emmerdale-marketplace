/**
 * Date ranges for reports: the accounting year from a year end (MM-DD), UK
 * date formatting, and today's date in the UK (not UTC).
 */

export function todayUk(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(y, m))).padStart(2, '0')}`;
}

function addDays(isoDate: string, n: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The accounting year containing `on`, from a year end like "06-30". With no
 * year end, the 12 months to `on`. `offset` −1 gives the year before.
 */
export function accountingYear(yearEnd: string | null, on: string, offset = 0): { from: string; to: string } {
  const [y, m, d] = on.split('-').map(Number);
  if (!yearEnd) {
    const to = iso(y + offset, m, d);
    return { from: addDays(iso(y + offset - 1, m, d), 1), to };
  }
  const [em, ed] = yearEnd.split('-').map(Number);
  let endYear = y;
  if (on > iso(y, em, ed)) endYear = y + 1;
  endYear += offset;
  const to = iso(endYear, em, ed);
  const from = addDays(iso(endYear - 1, em, ed), 1);
  return { from, to };
}

/** 2026-11-19 → 19 Nov 2026. */
export function ukDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
