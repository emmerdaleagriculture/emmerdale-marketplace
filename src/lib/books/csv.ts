/** CSV cells for Books exports. */

/** Free text: quoted when needed, and a leading = + - @ tab or CR defused so a spreadsheet won't run it. */
export function csvText(v: unknown): string {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Our own numbers, dates and codes: written as they are. */
export const csvRaw = (v: unknown) => (v == null ? '' : String(v));
