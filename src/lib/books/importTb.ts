/**
 * Opening balances from another bookkeeping app: a Trial Balance report
 * exported from Xero or FreshBooks (CSV or Excel) becomes one journal in
 * these books, dated the day the report is "as at". Each of their accounts
 * is matched to one of ours (or a new one is made), and the person checks
 * the matches before anything is posted.
 *
 * Layouts differ and change, so this reads by header, not by position: an
 * account column (name, often with the code in brackets as Xero writes
 * "Sales (200)"), an optional code and type column, and either debit and
 * credit columns (a year-to-date pair is preferred: in Xero that is the
 * balance) or one signed balance column. Section headings ("Revenue",
 * "Current Liabilities") give the type when there's no type column; totals
 * are skipped. Pure: no I/O.
 */

import { parseUkDate } from './bankCsv';
import type { AccountType, BusinessType } from './chart';
import { personalAccountCode } from './chart';

export type ImportedAccount = {
  /** Their code, if any ("200", "4000"). */
  code: string | null;
  name: string;
  type: AccountType | null;
  fixed: boolean;
  bank: boolean;
  /** Pence: + debit, − credit. */
  balance: number;
};

export type ParsedTrialBalance = {
  asAt: string | null;
  accounts: ImportedAccount[];
  debits: number;
  credits: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── Amounts and dates ───────────────────────────────────────────────────────

/** "1,234.56", "(1,234.56)", "-£12", "1234.5000001", "1.2E3", "12.00 Cr". Blank → 0; junk → NaN. */
export function tbAmount(raw: string): number {
  let t = (raw ?? '').trim().replace(/[£$€,\s]/g, '').replace(/^GBP|GBP$/gi, '');
  if (t === '' || t === '-' || t === '—' || t === '–') return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  }
  const suffix = t.match(/(cr|dr)$/i);
  if (suffix) {
    if (/cr/i.test(suffix[1])) sign *= -1;
    t = t.slice(0, -2);
  }
  if (/^[-+]?\d*\.?\d+e[-+]?\d+$/i.test(t)) t = Number(t).toFixed(2);
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

/** Excel's day number (1900 system) → ISO date. */
function excelDate(n: number): string | null {
  if (!(n > 20000 && n < 80000)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

/** The report date from the title rows: "As at 31 March 2026", "As of Mar 31, 2026", "31/03/2026". */
export function findAsAt(rows: string[][], before: number): string | null {
  const cells = rows.slice(0, Math.max(before, 0)).flat().map((c) => (c ?? '').trim()).filter(Boolean);
  for (const c of cells) {
    const m = c.match(/\b(?:as at|as of|to|ending|end date|period ending)\s*:?\s*(.+)$/i);
    if (m) {
      const d = parseUkDate(m[1].replace(/(\d)(st|nd|rd|th)\b/i, '$1').trim());
      if (d) return d;
    }
  }
  for (const c of cells) {
    const d = parseUkDate(c.replace(/(\d)(st|nd|rd|th)\b/i, '$1')) ?? (/^\d{5}$/.test(c) ? excelDate(Number(c)) : null);
    if (d) return d;
  }
  return null;
}

// ── Types ───────────────────────────────────────────────────────────────────

type Kind = { type: AccountType; fixed?: boolean; bank?: boolean };

/** Xero and FreshBooks account types and the headings they group accounts under. */
export function typeFromLabel(label: string): Kind | null {
  const t = norm(label);
  if (!t) return null;
  if (/^bank|bank accounts?$|^cash( and cash equivalents| at bank)?$/.test(t)) return { type: 'asset', bank: true };
  if (/fixed assets?|non current assets?|property plant|tangible assets?/.test(t)) return { type: 'asset', fixed: true };
  if (/assets?$|^inventory|^stock$|prepayments?$|receivables?$|^current assets?/.test(t)) return { type: 'asset' };
  if (/liabilit|payables?$|^credit cards?$/.test(t)) return { type: 'liability' };
  if (/equity|capital|reserves|owners? funds/.test(t)) return { type: 'equity' };
  if (/revenue|income|^sales$|^turnover|trading income/.test(t)) return { type: 'income' };
  if (/expense|cost of (sales|goods)|direct costs?|overheads?|depreciation|purchases/.test(t)) return { type: 'expense' };
  return null;
}

/** A guess from the account's own name, when nothing else says. */
function typeFromName(name: string): Kind | null {
  const t = norm(name);
  if (/\bbank\b|current account|savings|deposit account|petty cash/.test(t) && !/charges|fees|interest|loan/.test(t)) return { type: 'asset', bank: true };
  if (/receivable|debtors|prepayment/.test(t)) return { type: 'asset' };
  if (/payable|creditors|accrual|vat|paye|loan|credit card|hmrc|corporation tax/.test(t)) return { type: 'liability' };
  if (/retained|capital|drawings|share|funds introduced|equity/.test(t)) return { type: 'equity' };
  if (/sales|revenue|income|turnover/.test(t)) return { type: 'income' };
  return null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

type Cols = { name: number; code?: number; type?: number; debit?: number; credit?: number; balance?: number };

function findHeader(rows: string[][]): { at: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map((c) => norm(c ?? ''));
    const debits = h.flatMap((c, j) => (/\bdebits?\b|\bdr\b/.test(c) ? [j] : []));
    const credits = h.flatMap((c, j) => (/\bcredits?\b|\bcr\b/.test(c) ? [j] : []));
    const balances = h.flatMap((c, j) => (/^(ytd )?(closing |net )?balance|^amount$|^net$/.test(c) ? [j] : []));
    if (!(debits.length && credits.length) && !balances.length) continue;
    const ytd = (j: number) => /ytd|year to date/.test(h[j]);
    const code = h.findIndex((c) => /^(account )?(code|no|number|num)$|^gl code$|^nominal( code)?$/.test(c));
    const type = h.findIndex((c) => /^(account )?(type|class|category)$/.test(c));
    let name = h.findIndex((c) => /^(account|accounts|account name|name|description|nominal name)$/.test(c));
    if (name < 0) name = h.findIndex((c, j) => c !== '' && j !== code && j !== type && !debits.includes(j) && !credits.includes(j));
    if (name < 0) name = 0;
    const cols: Cols = { name, ...(code >= 0 ? { code } : {}), ...(type >= 0 ? { type } : {}) };
    if (debits.length && credits.length) {
      cols.debit = debits.find(ytd) ?? debits[0];
      cols.credit = credits.find(ytd) ?? credits[0];
    } else cols.balance = balances.find(ytd) ?? balances[0];
    return { at: i, cols };
  }
  return null;
}

/** "Sales (200)" → {name: Sales, code: 200}; "200 - Sales" too. */
export function splitName(raw: string): { name: string; code: string | null } {
  const s = raw.trim().replace(/\s+/g, ' ');
  let m = s.match(/^(.*\S)\s*\(([A-Za-z0-9.\-/]{1,12})\)$/);
  if (m && /\d/.test(m[2])) return { name: m[1], code: m[2] };
  m = s.match(/^(\d[\d.\-/]{0,11})\s*[-–:]?\s+(.+)$/);
  if (m) return { name: m[2], code: m[1] };
  return { name: s, code: null };
}

export function parseTrialBalance(rows: string[][]): ParsedTrialBalance | { error: string } {
  const found = findHeader(rows);
  if (!found) {
    return { error: 'That doesn’t look like a trial balance: there are no Debit and Credit columns. Export the Trial Balance report and upload that file.' };
  }
  const { at, cols } = found;
  const accounts: ImportedAccount[] = [];
  let section: Kind | null = null;
  for (const row of rows.slice(at + 1)) {
    const cell = (j?: number) => (j == null ? '' : (row[j] ?? '').trim());
    const label = cell(cols.name) || row.find((c) => (c ?? '').trim())?.trim() || '';
    if (!label) continue;
    if (/^(total|net |grand total|balance$|difference|out of balance)/i.test(label)) continue;
    const amounts = cols.balance != null ? [cell(cols.balance)] : [cell(cols.debit), cell(cols.credit)];
    if (amounts.every((a) => a === '')) {
      // A heading row: remember what it says about the accounts under it.
      section = typeFromLabel(label) ?? section;
      continue;
    }
    const balance =
      cols.balance != null ? tbAmount(cell(cols.balance)) : tbAmount(cell(cols.debit)) - tbAmount(cell(cols.credit));
    if (Number.isNaN(balance)) return { error: `The amount for “${label}” can’t be read.` };
    if (balance === 0) continue;
    const split = splitName(label);
    const code = cell(cols.code) || split.code;
    const given = cols.type != null ? typeFromLabel(cell(cols.type)) : null;
    const byName = typeFromName(split.name);
    const found = given ?? section ?? byName;
    // "Assets" as a heading doesn't say which of them is the bank; the name does.
    const kind = found && found.type === 'asset' && !found.fixed && byName?.bank ? { ...found, bank: true } : found;
    accounts.push({
      code: code || null,
      name: split.name.slice(0, 120),
      type: kind?.type ?? null,
      fixed: Boolean(kind?.fixed),
      bank: Boolean(kind?.bank),
      balance,
    });
  }
  if (!accounts.length) return { error: 'No account balances were found in that file.' };
  const debits = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0);
  const credits = accounts.reduce((s, a) => s + Math.max(-a.balance, 0), 0);
  return { asAt: findAsAt(rows, at), accounts, debits, credits };
}

// ── Matching to our chart ───────────────────────────────────────────────────

export type OurAccount = { code: string; name: string; type: AccountType | string };

/** Keyword → our code, checked in order; a rule only applies if its type fits. */
const RULES: { re: RegExp; code: string; types?: AccountType[]; fixed?: boolean }[] = [
  { re: /accumulated depreciation|less depreciation|provision/, code: '' },
  { re: /receivable|trade debtors|^debtors/, code: '1100', types: ['asset'] },
  { re: /payable|trade creditors|^creditors/, code: '2100', types: ['liability'] },
  { re: /\bvat\b|\bgst\b|sales tax/, code: '2201', types: ['liability'] },
  { re: /\bvat\b|\bgst\b|sales tax/, code: '2202', types: ['asset'] },
  { re: /stripe/, code: '1220', types: ['asset'] },
  { re: /credit card/, code: '1210', types: ['liability'] },
  { re: /retained (earnings|profits?)|current year earnings|profit and loss reserve/, code: '3100', types: ['equity'] },
  { re: /directors? loan/, code: '2300', types: ['liability', 'asset', 'equity'] },
  { re: /share capital|ordinary shares/, code: '3000', types: ['equity'] },
  { re: /drawings/, code: '3200', types: ['equity'] },
  { re: /capital introduced|funds introduced|owners? (funds|contribution|investment|capital)/, code: '3000', types: ['equity'] },
  { re: /computer/, code: '0030', fixed: true },
  { re: /office equipment|furniture|fixtures/, code: '0040', fixed: true },
  { re: /motor vehicles?|\bvans?\b|\bcars?\b/, code: '0050', fixed: true },
  { re: /machinery|plant|tractor|equipment/, code: '0060', fixed: true },
  { re: /livestock sales/, code: '4100', types: ['income'] },
  { re: /hay|straw|crop|produce/, code: '4110', types: ['income'] },
  { re: /grazing|land rent|rental income/, code: '4120', types: ['income'] },
  { re: /grant|subsid|bps|sfi/, code: '4130', types: ['income'] },
  { re: /interest|other (income|revenue)|sundry income|miscellaneous income/, code: '4900', types: ['income'] },
  { re: /sales|revenue|turnover|fees|services|income/, code: '4000', types: ['income'] },
  { re: /feed/, code: '5100', types: ['expense'] },
  { re: /seed/, code: '5110', types: ['expense'] },
  { re: /fertili|spray|chemical/, code: '5120', types: ['expense'] },
  { re: /\bvet|medicine/, code: '5130', types: ['expense'] },
  { re: /livestock purchase/, code: '5140', types: ['expense'] },
  { re: /subcontract|contractors|machinery hire|plant hire/, code: '5150', types: ['expense'] },
  { re: /red diesel|farm fuel|machinery fuel/, code: '5160', types: ['expense'] },
  { re: /fenc|hedg/, code: '5170', types: ['expense'] },
  { re: /cost of (sales|goods)|direct costs?|purchases|materials|stock/, code: '5000', types: ['expense'] },
  { re: /\brent\b|rates/, code: '6100', types: ['expense'] },
  { re: /repair|maintenance/, code: '6150', types: ['expense'] },
  { re: /light|power|heat|utilit|electric|\bgas\b|water/, code: '6200', types: ['expense'] },
  { re: /subsistence|meals/, code: '6310', types: ['expense'] },
  { re: /mileage/, code: '6330', types: ['expense'] },
  { re: /motor|vehicle|fuel|\bvan\b|\bcar\b/, code: '6320', types: ['expense'] },
  { re: /travel|parking|accommodation/, code: '6300', types: ['expense'] },
  { re: /telephone|phone|internet|broadband|mobile/, code: '6400', types: ['expense'] },
  { re: /software|subscription|membership/, code: '6410', types: ['expense'] },
  { re: /stationery|printing|office (expenses|supplies|costs)/, code: '6500', types: ['expense'] },
  { re: /postage|freight|courier|delivery/, code: '6510', types: ['expense'] },
  { re: /advertis|marketing/, code: '6600', types: ['expense'] },
  { re: /accountan|legal|professional|consult|bookkeep/, code: '6700', types: ['expense'] },
  { re: /bank (fees|charges)|merchant|card fees|stripe fees/, code: '6800', types: ['expense'] },
  { re: /insurance/, code: '6900', types: ['expense'] },
  { re: /training/, code: '6950', types: ['expense'] },
  { re: /entertain/, code: '6960', types: ['expense'] },
  { re: /welfare/, code: '6970', types: ['expense'] },
  { re: /general|sundry|miscellaneous|other expenses/, code: '6990', types: ['expense'] },
];

/** "new:<type>" makes a new account of that type; anything else is one of our codes. */
export type Target = string;
export const newTarget = (type: AccountType) => `new:${type}` as const;

/**
 * Suggest where each imported account goes. Same name as one of ours wins,
 * then the keyword rules, then a new account. Only the first bank account is
 * matched to the main bank (1200); others get accounts of their own.
 */
export function suggestTargets(imported: ImportedAccount[], ours: OurAccount[], businessType: BusinessType): Target[] {
  const byCode = new Map(ours.map((a) => [a.code, a]));
  const byName = new Map(ours.map((a) => [norm(a.name), a.code]));
  let mainBankUsed = false;
  return imported.map((acc) => {
    const n = norm(acc.name);
    const fallbackType: AccountType = acc.type ?? (acc.balance > 0 ? 'expense' : 'income');
    const same = byName.get(n);
    if (same && (!acc.type || byCode.get(same)?.type === acc.type)) {
      if (same === '1200') mainBankUsed = true;
      return same;
    }
    if (acc.bank) {
      if (!mainBankUsed && byCode.has('1200')) {
        mainBankUsed = true;
        return '1200';
      }
      return newTarget('asset');
    }
    for (const r of RULES) {
      if (!r.re.test(n)) continue;
      if (r.code === '') break;
      if (r.fixed !== undefined && r.fixed !== acc.fixed) continue;
      if (r.types && acc.type && !r.types.includes(acc.type)) continue;
      if (!r.types && !r.fixed && acc.type && byCode.get(r.code)?.type !== acc.type) continue;
      // The owner's account is 3000 for a sole trader / partnership, 2300 for a company.
      let code = r.code;
      if (code === '2300' && businessType !== 'limited_company') code = personalAccountCode(businessType);
      if (code === '3200' && businessType === 'limited_company') code = '2300';
      if (code === '3000' && /capital introduced|funds introduced|owner/.test(n) && businessType === 'limited_company') code = '2300';
      const ours = byCode.get(code);
      if (ours) return code;
    }
    return newTarget(fallbackType);
  });
}

// ── New accounts and the journal ────────────────────────────────────────────

const RANGES: Record<string, [number, number][]> = {
  bank: [[1230, 1299]],
  fixed: [[10, 99]],
  asset: [[1300, 1999], [1101, 1199]],
  liability: [[2400, 2999], [2101, 2199]],
  equity: [[3300, 3999]],
  income: [[4200, 4899], [4901, 4999]],
  expense: [[7000, 7999], [5200, 5999]],
};

function inRange(code: number, ranges: [number, number][]) {
  return ranges.some(([lo, hi]) => code >= lo && code <= hi);
}

/**
 * A free four-digit code for a new account: their own code if it's four
 * digits, free and sits where that type of account lives here; otherwise the
 * next free one in the range, in tens where possible.
 */
export function codeForNew(type: AccountType, acc: { code: string | null; fixed: boolean; bank: boolean }, taken: Set<string>): string | null {
  const key = type === 'asset' && acc.bank ? 'bank' : type === 'asset' && acc.fixed ? 'fixed' : type;
  const ranges = RANGES[key];
  if (acc.code && /^\d{4}$/.test(acc.code) && !taken.has(acc.code) && inRange(Number(acc.code), ranges)) return acc.code;
  for (const step of [10, 1]) {
    for (const [lo, hi] of ranges) {
      for (let c = Math.ceil(lo / step) * step; c <= hi; c += step) {
        const code = String(c).padStart(4, '0');
        if (!taken.has(code)) return code;
      }
    }
  }
  return null;
}

/** Lines for the opening journal: one per target, netted, debits first. */
export function openingLines(rows: { balance: number; code: string }[]): { code: string; debit: number; credit: number; memo?: string }[] {
  const net = new Map<string, number>();
  for (const r of rows) net.set(r.code, (net.get(r.code) ?? 0) + r.balance);
  return [...net]
    .filter(([, b]) => b !== 0)
    .sort((a, b) => (a[1] > 0 === b[1] > 0 ? a[0].localeCompare(b[0]) : a[1] > 0 ? -1 : 1))
    .map(([code, b]) => ({ code, debit: Math.max(b, 0), credit: Math.max(-b, 0) }));
}

// ── Starting balances typed in by hand ──────────────────────────────────────

/**
 * Starting balances as the person thinks of them: what each bank holds or
 * they're owed (assets, costs) and what they owe (liabilities, income), all
 * as plain positive amounts, a minus for an overdrawn bank. Turned into
 * signed balances (+ debit) with the difference to the owner's equity
 * account, so the journal always balances.
 */
export function startingBalances(
  amounts: { code: string; type: AccountType; amount: number }[],
  equityCode: string,
): { code: string; balance: number }[] {
  const rows = amounts
    .filter((a) => a.amount !== 0)
    .map((a) => ({ code: a.code, balance: a.type === 'asset' || a.type === 'expense' ? a.amount : -a.amount }));
  const net = rows.reduce((s, r) => s + r.balance, 0);
  return net === 0 ? rows : [...rows, { code: equityCode, balance: -net }];
}
