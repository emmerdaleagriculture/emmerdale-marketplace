/**
 * UK tax rates the tax pointers use, one row per tax year (6 April to
 * 5 April), kept here so each April's changes are one edit. All money in
 * pence. A year past the last row uses the last row, and the page says so.
 *
 * Sources: GOV.UK rates and allowances; gov.scot "Scottish Income Tax: rates
 * and bands 2026 to 2027" (bands are rate limits on income after the
 * personal allowance); Autumn Budget 2025 dividend changes from 6 April 2026.
 */

export type Band = { upTo: number | null; rate: number };

export type TaxYearRates = {
  /** First calendar year of the tax year: 2026 = 2026-27. */
  year: number;
  personalAllowance: number;
  /** The allowance goes down £1 for every £2 of income above this. */
  allowanceTaperFrom: number;
  /** Bands on taxable income (after the allowance); upTo null = the rest. */
  incomeTax: Band[];
  scottishIncomeTax: Band[];
  /** Class 4 National Insurance on self-employed profits. */
  class4: { lower: number; upper: number; main: number; above: number };
  dividendAllowance: number;
  dividend: { basic: number; higher: number; additional: number };
  /** Employer (secondary) National Insurance. */
  employerNi: { threshold: number; rate: number };
  corporationTax: { small: number; main: number; lower: number; upper: number; marginalFraction: number };
  annualInvestmentAllowance: number;
  writingDown: { main: number; special: number };
  /** s455 tax on an overdrawn director's loan not repaid in time. */
  s455: number;
  /** Tax-free amount a company can pay an employee or director working from home, per week. */
  homeWorkingWeekly: number;
  /** Simplified expenses for the self-employed working from home, per month, by hours worked there. */
  homeFlatRate: { hours: string; monthly: number }[];
  tradingAllowance: number;
  staffPartyPerHead: number;
  trivialBenefit: number;
  /** Self Assessment bill above which payments on account are due. */
  paymentsOnAccountFrom: number;
};

const P = (pounds: number) => Math.round(pounds * 100);

const COMMON = {
  personalAllowance: P(12_570),
  allowanceTaperFrom: P(100_000),
  incomeTax: [
    { upTo: P(37_700), rate: 0.2 },
    { upTo: P(125_140), rate: 0.4 },
    { upTo: null, rate: 0.45 },
  ],
  class4: { lower: P(12_570), upper: P(50_270), main: 0.06, above: 0.02 },
  dividendAllowance: P(500),
  employerNi: { threshold: P(5_000), rate: 0.15 },
  corporationTax: { small: 0.19, main: 0.25, lower: P(50_000), upper: P(250_000), marginalFraction: 3 / 200 },
  annualInvestmentAllowance: P(1_000_000),
  writingDown: { main: 0.18, special: 0.06 },
  s455: 0.3375,
  homeWorkingWeekly: P(6),
  homeFlatRate: [
    { hours: '25 to 50 hours a month', monthly: P(10) },
    { hours: '51 to 100 hours a month', monthly: P(18) },
    { hours: '101 hours or more a month', monthly: P(26) },
  ],
  tradingAllowance: P(1_000),
  staffPartyPerHead: P(150),
  trivialBenefit: P(50),
  paymentsOnAccountFrom: P(1_000),
};

export const TAX_YEARS: TaxYearRates[] = [
  {
    ...COMMON,
    year: 2025,
    // Rate limits after the allowance: starter to £15,397, basic to £27,491,
    // intermediate to £43,662, higher to £75,000, advanced to £125,140.
    scottishIncomeTax: [
      { upTo: P(2_827), rate: 0.19 },
      { upTo: P(14_921), rate: 0.2 },
      { upTo: P(31_092), rate: 0.21 },
      { upTo: P(62_430), rate: 0.42 },
      { upTo: P(125_140), rate: 0.45 },
      { upTo: null, rate: 0.48 },
    ],
    dividend: { basic: 0.0875, higher: 0.3375, additional: 0.3935 },
  },
  {
    ...COMMON,
    year: 2026,
    // Starter to £16,537, basic to £29,526, intermediate to £43,662,
    // higher to £75,000, advanced to £125,140.
    scottishIncomeTax: [
      { upTo: P(3_967), rate: 0.19 },
      { upTo: P(16_956), rate: 0.2 },
      { upTo: P(31_092), rate: 0.21 },
      { upTo: P(62_430), rate: 0.42 },
      { upTo: P(125_140), rate: 0.45 },
      { upTo: null, rate: 0.48 },
    ],
    dividend: { basic: 0.1075, higher: 0.3575, additional: 0.3935 },
  },
];

/** The tax year a date falls in: 2026-04-06 → 2026, 2026-04-05 → 2025. */
export function taxYearOf(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return isoDate.slice(5) >= '04-06' ? y : y - 1;
}

/** That year's rates, or the latest we have (and whether it's a stand-in). */
export function ratesFor(year: number): { rates: TaxYearRates; exact: boolean } {
  const exact = TAX_YEARS.find((r) => r.year === year);
  if (exact) return { rates: exact, exact: true };
  const sorted = [...TAX_YEARS].sort((a, b) => a.year - b.year);
  const rates = year < sorted[0].year ? sorted[0] : sorted[sorted.length - 1];
  return { rates, exact: false };
}

export const taxYearLabel = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

/** Tax on an amount through a set of bands. */
function banded(amount: number, bands: Band[]): number {
  let tax = 0;
  let floor = 0;
  for (const b of bands) {
    if (amount <= floor) break;
    const top = b.upTo === null ? amount : Math.min(amount, b.upTo);
    tax += (top - floor) * b.rate;
    floor = b.upTo ?? amount;
  }
  return Math.round(tax);
}

/** The personal allowance left at a level of income. */
export function personalAllowanceAt(income: number, r: TaxYearRates): number {
  if (income <= r.allowanceTaperFrom) return r.personalAllowance;
  return Math.max(0, r.personalAllowance - Math.floor((income - r.allowanceTaperFrom) / 2));
}

/** Income tax on non-savings income (earnings, profits, pensions, rent). */
export function incomeTax(income: number, r: TaxYearRates, scottish = false): number {
  if (income <= 0) return 0;
  const taxable = income - personalAllowanceAt(income, r);
  return banded(Math.max(0, taxable), scottish ? r.scottishIncomeTax : r.incomeTax);
}

/** Class 4 National Insurance on a year's self-employed profit. */
export function class4(profit: number, r: TaxYearRates): number {
  const { lower, upper, main, above } = r.class4;
  if (profit <= lower) return 0;
  return Math.round((Math.min(profit, upper) - lower) * main + Math.max(0, profit - upper) * above);
}

/**
 * Corporation tax on a year's taxable profit, with marginal relief between
 * the limits. The limits are shared between associated companies.
 */
export function corporationTax(profit: number, r: TaxYearRates, associated = 0): number {
  if (profit <= 0) return 0;
  const { small, main, lower, upper, marginalFraction } = r.corporationTax;
  const lo = lower / (1 + associated);
  const hi = upper / (1 + associated);
  if (profit <= lo) return Math.round(profit * small);
  if (profit >= hi) return Math.round(profit * main);
  return Math.round(profit * main - (hi - profit) * marginalFraction);
}
