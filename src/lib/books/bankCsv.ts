/**
 * Bank statement CSVs (Tally 2.11): Monzo's export and the common UK bank
 * layouts. A date column plus either one signed amount column or separate
 * paid-in / paid-out (credit / debit) columns. Lines above the table are
 * skipped, newest-first files are flipped, and dates are read day-first in
 * the formats UK banks use. Pure: no I/O, so it runs in tests as is.
 */

export type BankRow = {
  /** Stable key for the row: the bank's transaction id, or built from its contents. */
  key: string;
  date: string; // YYYY-MM-DD
  payee: string;
  description: string;
  /** Pence, + money in, − money out. */
  amount: number;
  balance: number | null;
  type: string | null;
};

export type ParsedStatement = {
  rows: BankRow[];
  start: string;
  end: string;
  opening: number | null;
  closing: number | null;
  skipped: number;
};

// ── CSV ─────────────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, comma / semicolon / tab. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const sample = src.split(/\r?\n/).slice(0, 20).join('\n');
  const count = (c: string) => sample.split(c).length - 1;
  const delim = [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

// ── Dates and amounts ───────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A UK statement date, day first: 31/01/2026, 31/01/26, 31-01-2026, 31.01.2026,
 * 2026-01-31, 2026/01/31, 31 Jan 2026, 31-Jan-2026, 31 Jan 26, 31 January 2026,
 * Jan 31, 2026 — with or without a time after it. Null if it isn't one.
 */
export function parseUkDate(s: string): string | null {
  const t = s.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i, '').trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{2}|\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()];
    return mon ? iso(+m[3], mon, +m[1]) : null;
  }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mon ? iso(+m[3], mon, +m[2]) : null;
  }
  return null;
}

/**
 * A statement amount in pence: "1,234.56", "£-12.00", "-£12", "(12.00)",
 * "12.00 CR", "12.00 DR", "+5". Blank → null; junk → NaN.
 */
export function parseAmount(s: string): number | null {
  // Anything that isn't a digit, sign, point, bracket or letter goes: £ (or a
  // £ mangled by the wrong text encoding), spaces and thousands commas.
  let t = s.trim().replace(/[^0-9.+\-()A-Za-z]/g, '').replace(/^GBP/i, '').replace(/GBP$/i, '');
  if (t === '' || t === '-') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  const suffix = t.match(/(CR|DR|D|C)$/i);
  if (suffix) {
    if (/^D/i.test(suffix[1])) sign *= -1;
    t = t.slice(0, -suffix[1].length);
  }
  if (t.startsWith('+')) t = t.slice(1);
  if (t.startsWith('-')) {
    sign *= -1;
    t = t.slice(1);
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return NaN;
  const [whole, frac = ''] = t.split('.');
  const padded = (frac + '000').slice(0, 3);
  let pence = Number(whole || '0') * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) pence += 1;
  return sign * pence;
}

// ── Columns ─────────────────────────────────────────────────────────────────

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Header names in order of preference for each field. */
const HEADERS = {
  date: ['date', 'transaction date', 'completed date', 'date completed', 'posting date', 'posted date', 'value date', 'booking date', 'started date', 'date started', 'created'],
  payee: ['name', 'counter party', 'counterparty', 'payee', 'merchant', 'merchant name', 'beneficiary', 'description', 'transaction description', 'transaction information', 'details', 'narrative', 'memo'],
  extra: ['reference', 'notes and tags', 'notes', 'memo', 'description', 'transaction description', 'details', 'narrative'],
  amount: ['amount', 'value', 'transaction amount', 'amount gbp', 'net amount'],
  moneyIn: ['paid in', 'money in', 'credit', 'credit amount', 'credits', 'in', 'receipts', 'deposits'],
  moneyOut: ['paid out', 'money out', 'debit', 'debit amount', 'debits', 'out', 'payments', 'withdrawals'],
  balance: ['balance', 'running balance', 'account balance', 'closing balance'],
  id: ['transaction id', 'id', 'transaction reference', 'fitid'],
  type: ['type', 'transaction type'],
} as const;

type Field = keyof typeof HEADERS;
export type ColumnMap = Partial<Record<Exclude<Field, 'extra'>, number>> & { extra?: number[] };

function mapHeader(cells: string[]): ColumnMap {
  const names = cells.map(norm);
  const map: ColumnMap = {};
  const taken = new Set<number>();
  // Amount-type columns first so 'description' etc. can't steal them; payee before extra.
  for (const f of ['date', 'amount', 'moneyIn', 'moneyOut', 'balance', 'id', 'type', 'payee'] as const) {
    for (const want of HEADERS[f]) {
      const i = names.findIndex((n, j) => n === want && !taken.has(j));
      if (i >= 0) {
        map[f] = i;
        taken.add(i);
        break;
      }
    }
  }
  // Every other text column worth showing, best first; a row uses the first that isn't blank.
  map.extra = HEADERS.extra.map((want) => names.findIndex((n, j) => n === want && !taken.has(j))).filter((i) => i >= 0);
  return map;
}

const usable = (m: ColumnMap) => m.date != null && (m.amount != null || (m.moneyIn != null && m.moneyOut != null));

/**
 * Find the table: the first of the top 20 lines that reads as a header.
 * Failing that, a file with no header whose first line starts with a date
 * is read as date, description, amount[, balance].
 */
export function findColumns(rows: string[][]): { header: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const map = mapHeader(rows[i]);
    if (usable(map)) return { header: i, map };
  }
  const first = rows[0];
  if (first && parseUkDate(first[0] ?? '') && first.length >= 3) {
    const amount = parseAmount(first[2] ?? '');
    if (amount != null && !Number.isNaN(amount)) {
      return { header: -1, map: { date: 0, payee: 1, amount: 2, ...(first.length >= 4 ? { balance: 3 } : {}) } };
    }
  }
  return null;
}

// ── The statement ───────────────────────────────────────────────────────────

export type StatementError = { error: string };

/**
 * Read a statement into rows in date order. Rows that aren't transactions
 * (totals, blank amounts, footers) are skipped and counted. Each row's key is
 * the bank's own transaction id when the file has one, otherwise its date,
 * amount, payee and balance, with a counter for identical rows on a day.
 */
export function parseStatement(text: string, opts: { flip?: boolean } = {}): ParsedStatement | StatementError {
  const cells = parseCsv(text);
  if (!cells.length) return { error: 'That file is empty.' };
  const found = findColumns(cells);
  if (!found) {
    return { error: 'We couldn’t find a date and an amount column in that file. Download the statement as CSV from your bank and try again.' };
  }
  const { header, map } = found;
  const col = (r: string[], f: Exclude<Field, 'extra'>) => (map[f] != null ? (r[map[f]!] ?? '') : '');
  let skipped = 0;
  type Raw = Omit<BankRow, 'key'> & { id: string };
  const raws: Raw[] = [];
  cells.slice(header + 1).forEach((r) => {
    const date = parseUkDate(col(r, 'date'));
    let amount: number | null;
    if (map.amount != null) amount = parseAmount(col(r, 'amount'));
    else {
      const inn = parseAmount(col(r, 'moneyIn'));
      const out = parseAmount(col(r, 'moneyOut'));
      if (Number.isNaN(inn) || Number.isNaN(out)) amount = NaN;
      else amount = Math.abs(inn ?? 0) - Math.abs(out ?? 0);
    }
    if (opts.flip && amount != null) amount = -amount;
    if (!date || amount == null || Number.isNaN(amount) || amount === 0) {
      skipped++;
      return;
    }
    const bal = parseAmount(col(r, 'balance'));
    const payee = col(r, 'payee').replace(/\s+/g, ' ').slice(0, 200);
    const extra = ((map.extra ?? []).map((i) => r[i] ?? '').find((v) => v.trim() && v.trim() !== payee) ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 300);
    raws.push({
      id: col(r, 'id'),
      date,
      payee: payee || extra || 'Bank transaction',
      description: extra && extra !== payee ? extra : '',
      amount,
      balance: bal == null || Number.isNaN(bal) ? null : bal,
      type: col(r, 'type') || null,
    });
  });
  if (!raws.length) return { error: 'We couldn’t read any transactions in that file.' };
  if (raws.length > 20000) return { error: 'That file has more than 20,000 rows. Upload a shorter period.' };

  // Newest first → oldest first, keeping same-day order as the bank had it.
  const newestFirst = raws[0].date > raws[raws.length - 1].date;
  if (newestFirst) raws.reverse();
  raws.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const seen = new Map<string, number>();
  const rows: BankRow[] = raws.map(({ id, ...r }) => {
    let key: string;
    if (id) key = `id:${id.slice(0, 80)}`;
    else {
      const base = `${r.date}|${r.amount}|${r.payee.toLowerCase()}|${r.balance ?? ''}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      key = `h:${hash(`${base}|${n}`)}`;
    }
    return { key, ...r };
  });

  const first = rows[0];
  const last = rows[rows.length - 1];
  // Opening = the balance before the first row; closing = after the last.
  const opening = first.balance != null ? first.balance - first.amount : null;
  return { rows, start: first.date, end: last.date, opening, closing: last.balance, skipped };
}

/** A payee name as a lookup key: lower case, digits and card noise dropped. */
export function payeeKey(payee: string): string {
  return payee
    .toLowerCase()
    .replace(/\b(card|pos|dd|so|bp|fpi|fpo|bgc|tfr|cr|dr|contactless|payment to|payment from)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** cyrb53: a fast 53-bit string hash, as 14 hex digits. Not for security; for row keys. */
export function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
