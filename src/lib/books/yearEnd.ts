/**
 * Year-end figures for a limited company's accounts and CT600, worked out
 * from the books and then checked and edited by the owner before anything is
 * sent to TinyTax (filing.server.ts). Pure: no database, so it's tested.
 *
 * Everything here is in pence; toFinancials() turns it into the pounds
 * TinyTax takes. The profit and loss reserve is never typed in: it's net
 * assets less share capital, so the balance sheet always balances.
 */

import type { Financials } from './tinytax';

export type TbLike = { code: string; name: string; type: string; is_fixed_asset: boolean; debit_pence: number; credit_pence: number };

export type DirectorLoanFigures = {
  name: string;
  /** Owed by the director at the start of the year. */
  broughtForward: number;
  /** Lent during the year (including any part repaid before the year end). */
  lent: number;
  /** Of that, repaid on or before the year end. */
  repaidInYear: number;
  /** Of what was owed at the year end, repaid within nine months after it. */
  repaidAfter: number;
  repaidDate: string | null;
};

export type YearEndFigures = {
  // Profit and loss for the year
  turnover: number;
  otherIncome: number;
  costOfSales: number;
  staffCosts: number;
  depreciation: number;
  otherExpenses: number;
  /** Corporation tax charged in the accounts; may be negative (over-provided). Accounts only. */
  taxCharge: number;
  // Tax adjustments (CT600 only)
  capitalAllowances: number;
  disallowable: number;
  lossesBroughtForward: number;
  // Balance sheet at the year end
  fixedAssets: number;
  currentAssets: number;
  creditorsWithinYear: number;
  creditorsAfterYear: number;
  shareCapital: number;
  // Last year's balance sheet and results (comparatives; TinyTax requires them unless it's the first year)
  priorFixedAssets: number;
  priorCurrentAssets: number;
  priorCreditorsWithinYear: number;
  priorCreditorsAfterYear: number;
  priorShareCapital: number;
  priorTurnover: number;
  /** May be negative (a loss). */
  priorProfitBeforeTax: number;
  /** The company's first accounting period: no comparatives. */
  firstYear: boolean;
  // Other
  averageEmployees: number;
  declarantName: string;
  associatedCompanies: number;
  directorLoan: DirectorLoanFigures | null;
};

export const PENCE_FIELDS = [
  'turnover',
  'otherIncome',
  'costOfSales',
  'staffCosts',
  'depreciation',
  'otherExpenses',
  'taxCharge',
  'capitalAllowances',
  'disallowable',
  'lossesBroughtForward',
  'fixedAssets',
  'currentAssets',
  'creditorsWithinYear',
  'creditorsAfterYear',
  'shareCapital',
  'priorFixedAssets',
  'priorCurrentAssets',
  'priorCreditorsWithinYear',
  'priorCreditorsAfterYear',
  'priorShareCapital',
  'priorTurnover',
  'priorProfitBeforeTax',
] as const satisfies readonly (keyof YearEndFigures)[];
export type PenceField = (typeof PENCE_FIELDS)[number];

/** Fields that may go below zero. */
export const SIGNED_FIELDS: readonly PenceField[] = ['taxCharge', 'priorProfitBeforeTax'];

/** Cars, vans and pickups. Kept out of AIA: cars (and double-cab pickups from April 2025) don't qualify, vans do, and the books can't tell which — the page says what was bought so the director can add vans. */
export const VEHICLES_ACCOUNT = '0050';
const VEHICLES = VEHICLES_ACCOUNT;
const ENTERTAINMENT = '6960';
const SHARE_CAPITAL = '3000';
export const DIRECTORS_LOAN = '2300';

const net = (r: TbLike) => r.debit_pence - r.credit_pence;
const empty = (r: TbLike) => r.debit_pence === 0 && r.credit_pence === 0;
const pos = (n: number) => Math.max(0, n);

type ExpenseBucket = 'taxCharge' | 'depreciation' | 'staffCosts' | 'costOfSales' | 'otherExpenses';

/** Which P&L line an expense account belongs on. Names count because people add their own accounts. */
export function expenseBucket(r: Pick<TbLike, 'code' | 'name'>): ExpenseBucket {
  const n = r.name.toLowerCase();
  if (/corporation tax/.test(n)) return 'taxCharge';
  if (/depreciat|amortis|amortiz/.test(n)) return 'depreciation';
  if (!/welfare/.test(n) && /wage|salar|payroll|pension|employer.{0,4}n\.?i\b|national insurance|staff cost/.test(n)) return 'staffCosts';
  if (r.code >= '5000' && r.code < '6000') return 'costOfSales';
  return 'otherExpenses';
}

/** Turnover is sales; bank interest and the "other income" fallback sit below it. */
export function incomeBucket(r: Pick<TbLike, 'code' | 'name'>): 'turnover' | 'otherIncome' {
  return r.code === '4900' || /interest/i.test(r.name) ? 'otherIncome' : 'turnover';
}

function isFixed(r: TbLike): boolean {
  return r.type === 'asset' && (r.is_fixed_asset || r.code < '1000');
}

type BalanceSheet = Pick<YearEndFigures, 'fixedAssets' | 'currentAssets' | 'creditorsWithinYear' | 'creditorsAfterYear' | 'shareCapital'>;

/** The balance sheet from balances to a date. */
export function balanceSheet(balances: TbLike[]): BalanceSheet {
  const b: BalanceSheet = { fixedAssets: 0, currentAssets: 0, creditorsWithinYear: 0, creditorsAfterYear: 0, shareCapital: 0 };
  let fixed = 0;
  for (const r of balances) {
    const n = net(r); // debit balance positive
    if (r.type === 'asset') {
      if (isFixed(r)) fixed += n;
      else if (n >= 0) b.currentAssets += n;
      else b.creditorsWithinYear += -n; // overdrawn bank
    } else if (r.type === 'liability') {
      if (n <= 0) b.creditorsWithinYear += -n;
      else b.currentAssets += n; // e.g. a director's loan account the director owes
    } else if (r.type === 'equity' && r.code === SHARE_CAPITAL) {
      b.shareCapital += pos(-n);
    }
  }
  b.fixedAssets = pos(fixed);
  return b;
}

/** Turnover and profit before tax for a year's movements. */
function results(year: TbLike[]): { turnover: number; profit: number } {
  let turnover = 0;
  let profit = 0;
  for (const r of year) {
    if (r.type === 'income') {
      profit += -net(r);
      if (incomeBucket(r) === 'turnover') turnover += -net(r);
    } else if (r.type === 'expense' && expenseBucket(r) !== 'taxCharge') profit -= net(r);
  }
  return { turnover: pos(turnover), profit };
}

/**
 * The figures as the books have them.
 * @param year movements for the accounting year
 * @param atEnd balances from the start of the books to the year end
 * @param atStart balances to the day before the year starts (for the director's loan)
 */
export function figuresFromBooks(
  year: TbLike[],
  atEnd: TbLike[],
  atStart: TbLike[],
  opts: {
    declarantName?: string;
    associatedCompanies?: number;
    priorYear?: TbLike[];
    /** Balances to the date of opening balances dated inside this year, and whether that's the year's first day. */
    opening?: { at: TbLike[]; onFirstDay: boolean };
  } = {},
): YearEndFigures {
  const f: YearEndFigures = {
    turnover: 0,
    otherIncome: 0,
    costOfSales: 0,
    staffCosts: 0,
    depreciation: 0,
    otherExpenses: 0,
    taxCharge: 0,
    capitalAllowances: 0,
    disallowable: 0,
    lossesBroughtForward: 0,
    fixedAssets: 0,
    currentAssets: 0,
    creditorsWithinYear: 0,
    creditorsAfterYear: 0,
    shareCapital: 0,
    priorFixedAssets: 0,
    priorCurrentAssets: 0,
    priorCreditorsWithinYear: 0,
    priorCreditorsAfterYear: 0,
    priorShareCapital: 0,
    priorTurnover: 0,
    priorProfitBeforeTax: 0,
    firstYear: false,
    averageEmployees: 1,
    declarantName: opts.declarantName ?? '',
    associatedCompanies: opts.associatedCompanies ?? 0,
    directorLoan: null,
  };

  for (const r of year) {
    if (r.type === 'income') f[incomeBucket(r)] += -net(r);
    else if (r.type === 'expense') f[expenseBucket(r)] += net(r);
  }
  // A bucket can only go below zero through refunds outweighing it; TinyTax wants ≥ 0.
  for (const k of ['turnover', 'otherIncome', 'costOfSales', 'staffCosts', 'depreciation', 'otherExpenses'] as const) f[k] = pos(f[k]);

  // With opening balances dated inside the year, only what moved after them was bought this year.
  const boughtFrom = opts.opening?.at;
  const fixedNet = (rows: TbLike[]) => rows.filter((r) => r.is_fixed_asset && r.code !== VEHICLES).reduce((t, r) => t + net(r), 0);
  f.capitalAllowances = pos(boughtFrom ? fixedNet(atEnd) - fixedNet(boughtFrom) : fixedNet(year));
  f.disallowable = pos(year.filter((r) => r.code === ENTERTAINMENT).reduce((t, r) => t + net(r), 0));

  Object.assign(f, balanceSheet(atEnd));

  // Comparatives: the balance sheet the day before the year starts, and last year's results.
  // Opening balances on the year's first day stand in for the balance sheet the day before.
  const prior = balanceSheet(opts.opening?.onFirstDay && atStart.every(empty) ? opts.opening.at : atStart);
  f.priorFixedAssets = prior.fixedAssets;
  f.priorCurrentAssets = prior.currentAssets;
  f.priorCreditorsWithinYear = prior.creditorsWithinYear;
  f.priorCreditorsAfterYear = prior.creditorsAfterYear;
  f.priorShareCapital = prior.shareCapital;
  const last = results(opts.priorYear ?? []);
  f.priorTurnover = last.turnover;
  f.priorProfitBeforeTax = last.profit;
  // Nothing at all before this year: it's the first.
  // Opening balances brought in during the year mean the company was trading before it.
  f.firstYear = atStart.every(empty) && !opts.opening;

  const dlaEnd = atEnd.find((r) => r.code === DIRECTORS_LOAN && r.type === 'liability');
  const owedAtEnd = dlaEnd ? net(dlaEnd) : 0;
  const dlaStart = atStart.find((r) => r.code === DIRECTORS_LOAN);
  const owedAtStart = pos(dlaStart ? net(dlaStart) : 0);
  // Owed at either end of the year has to be declared, even if cleared by the end.
  if (owedAtEnd > 0 || owedAtStart > 0) {
    f.directorLoan = {
      name: opts.declarantName ?? '',
      broughtForward: owedAtStart,
      lent: pos(owedAtEnd - owedAtStart),
      repaidInYear: pos(owedAtStart - pos(owedAtEnd)),
      repaidAfter: 0,
      repaidDate: null,
    };
  }
  return f;
}

export function profitBeforeTax(f: YearEndFigures): number {
  return f.turnover + f.otherIncome - f.costOfSales - f.staffCosts - f.depreciation - f.otherExpenses;
}

export function netAssets(f: YearEndFigures): number {
  return f.fixedAssets + f.currentAssets - f.creditorsWithinYear - f.creditorsAfterYear;
}

/** Profit and loss reserve (retained earnings), the balancing figure. */
export function reserve(f: YearEndFigures): number {
  return netAssets(f) - f.shareCapital;
}

export function priorNetAssets(f: YearEndFigures): number {
  return f.priorFixedAssets + f.priorCurrentAssets - f.priorCreditorsWithinYear - f.priorCreditorsAfterYear;
}

export function priorReserve(f: YearEndFigures): number {
  return priorNetAssets(f) - f.priorShareCapital;
}

/** Owed by the director at the year end, by these figures. */
export function loanOwedAtEnd(d: DirectorLoanFigures): number {
  return d.broughtForward + d.lent - d.repaidInYear;
}

/** Problems that stop a check or a filing; empty when the figures can go. */
export function problems(f: YearEndFigures, opts: { periodEnd: string; today: string; dlaOverdrawn: boolean }): string[] {
  const out: string[] = [];
  for (const k of PENCE_FIELDS) {
    const v = f[k];
    if (!Number.isInteger(v)) out.push(`${k} isn’t a whole number of pence.`);
    else if (v < 0 && !SIGNED_FIELDS.includes(k)) out.push(`${LABELS[k]} can’t be negative.`);
  }
  if (!Number.isInteger(f.averageEmployees) || f.averageEmployees < 0) out.push('Average employees should be a whole number, 0 or more.');
  if (!Number.isInteger(f.associatedCompanies) || f.associatedCompanies < 0) out.push('Associated companies should be a whole number, 0 or more.');
  if (f.declarantName.trim().length < 2) out.push('Give the name of the director signing the return.');
  if (opts.dlaOverdrawn && !f.directorLoan) {
    out.push('The director owes the company money at the year end. Fill in the director’s loan section, or correct the books.');
  }
  const d = f.directorLoan;
  if (d) {
    if (d.name.trim().length < 2 || d.name.trim().length > 56) out.push('Give the full name of the director who borrowed (2 to 56 characters).');
    for (const [k, v] of Object.entries({ broughtForward: d.broughtForward, lent: d.lent, repaidInYear: d.repaidInYear, repaidAfter: d.repaidAfter })) {
      if (!Number.isInteger(v) || v < 0) out.push(`Director’s loan: ${k} must be 0 or more.`);
    }
    if (d.repaidInYear > d.broughtForward + d.lent) out.push('Director’s loan: repaid in the year can’t be more than was owed.');
    if (d.lent < 100 && d.broughtForward < 100) out.push('Director’s loan: lent in the year should be at least £1 (or something brought forward).');
    if (d.repaidAfter > Math.max(0, loanOwedAtEnd(d))) out.push('Director’s loan: repaid after the year end can’t be more than was owed at the year end.');
    if (d.repaidAfter > 0) {
      if (!d.repaidDate) out.push('Director’s loan: give the date it was repaid.');
      else {
        const nineMonths = addMonths(opts.periodEnd, 9);
        if (d.repaidDate <= opts.periodEnd || d.repaidDate > nineMonths) out.push('Director’s loan: the repayment date must be within nine months after the year end.');
        if (d.repaidDate > opts.today) out.push('Director’s loan: the repayment date can’t be in the future.');
      }
    }
  }
  return out;
}

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

const pounds = (p: number) => Math.round(p) / 100;

/** The figures as TinyTax's `financials` block. */
export function toFinancials(f: YearEndFigures, opts: { forCt600: boolean }): Financials {
  const d = f.directorLoan;
  return {
    profit_and_loss: {
      turnover: pounds(f.turnover),
      cost_of_sales: pounds(f.costOfSales),
      staff_costs: pounds(f.staffCosts),
      depreciation: pounds(f.depreciation),
      other_operating_expenses: pounds(f.otherExpenses),
      other_income: pounds(f.otherIncome),
      ...(opts.forCt600 ? {} : { tax_charge: pounds(f.taxCharge) }),
    },
    ...(opts.forCt600
      ? {
          tax_adjustments: {
            depreciation_addback: pounds(f.depreciation),
            capital_allowances: pounds(f.capitalAllowances),
            disallowable_expenses: pounds(f.disallowable),
          },
          losses: { brought_forward: pounds(f.lossesBroughtForward) },
        }
      : {}),
    balance_sheet: {
      fixed_assets: pounds(f.fixedAssets),
      current_assets: pounds(f.currentAssets),
      creditors_within_one_year: pounds(f.creditorsWithinYear),
      creditors_after_one_year: pounds(f.creditorsAfterYear),
      share_capital: pounds(f.shareCapital),
      profit_and_loss_account: pounds(reserve(f)),
    },
    ...(f.firstYear
      ? {}
      : {
          prior_year: {
            fixed_assets: pounds(f.priorFixedAssets),
            current_assets: pounds(f.priorCurrentAssets),
            creditors_within_one_year: pounds(f.priorCreditorsWithinYear),
            creditors_after_one_year: pounds(f.priorCreditorsAfterYear),
            share_capital: pounds(f.priorShareCapital),
            profit_and_loss_account: pounds(priorReserve(f)),
            turnover: pounds(f.priorTurnover),
            profit_before_tax: pounds(f.priorProfitBeforeTax),
          },
        }),
    average_employees: f.averageEmployees,
    nil_disclosures_confirmed: true,
    director_loan: d
      ? {
          participator_name: d.name.trim(),
          ...(d.broughtForward ? { balance_brought_forward: pounds(d.broughtForward) } : {}),
          amount_lent: pounds(d.lent),
          ...(d.repaidInYear ? { amount_repaid_in_period: pounds(d.repaidInYear) } : {}),
          ...(d.repaidAfter ? { amount_repaid: pounds(d.repaidAfter), repaid_date: d.repaidDate ?? undefined } : {}),
          interest_rate: null,
          close_company: true,
        }
      : null,
  };
}

export const LABELS: Record<PenceField, string> = {
  turnover: 'Turnover',
  otherIncome: 'Other income',
  costOfSales: 'Cost of sales',
  staffCosts: 'Staff costs',
  depreciation: 'Depreciation',
  otherExpenses: 'Other operating expenses',
  taxCharge: 'Corporation tax charge',
  capitalAllowances: 'Capital allowances (AIA)',
  disallowable: 'Disallowable expenses',
  lossesBroughtForward: 'Trading losses brought forward',
  fixedAssets: 'Fixed assets',
  currentAssets: 'Current assets',
  creditorsWithinYear: 'Creditors due within one year',
  creditorsAfterYear: 'Creditors due after one year',
  shareCapital: 'Share capital',
  priorFixedAssets: 'Fixed assets',
  priorCurrentAssets: 'Current assets',
  priorCreditorsWithinYear: 'Creditors due within one year',
  priorCreditorsAfterYear: 'Creditors due after one year',
  priorShareCapital: 'Share capital',
  priorTurnover: 'Turnover',
  priorProfitBeforeTax: 'Profit (or loss) before tax',
};

/** Figures saved as JSON (books_year_ends.figures), read back defensively. */
export function readFigures(raw: unknown): YearEndFigures | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  const f = {} as YearEndFigures;
  for (const k of PENCE_FIELDS) f[k] = num(o[k]);
  f.averageEmployees = num(o.averageEmployees);
  f.associatedCompanies = num(o.associatedCompanies);
  f.declarantName = typeof o.declarantName === 'string' ? o.declarantName : '';
  f.firstYear = o.firstYear === true;
  const d = o.directorLoan as Record<string, unknown> | null | undefined;
  f.directorLoan =
    d && typeof d === 'object'
      ? {
          name: typeof d.name === 'string' ? d.name : '',
          broughtForward: num(d.broughtForward),
          lent: num(d.lent),
          repaidInYear: num(d.repaidInYear),
          repaidAfter: num(d.repaidAfter),
          repaidDate: typeof d.repaidDate === 'string' && d.repaidDate ? d.repaidDate : null,
        }
      : null;
  return f;
}
