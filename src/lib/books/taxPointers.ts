/**
 * Tax pointers (Tally 2.12 / 3.10, rebuilt for sole traders and partners as
 * well as companies). The books for a year are read and turned into pointers,
 * each marked as a saving, a risk, something to check, or good to know, with
 * what to do, a rough value and a GOV.UK link. Nothing here changes the books
 * and none of it is advice: it points at things to raise with an accountant.
 *
 * Values are worked out by taking the tax on the year's profit with and
 * without the amount, so they follow the bands rather than one flat rate.
 * Pure: the server hands in the figures (taxPointers.server.ts).
 */

import { addDays, ukDate } from './period';
import { class4, corporationTax, incomeTax, personalAllowanceAt, type TaxYearRates } from './taxRates';

export type TaxStructure = 'sole_trader' | 'partnership' | 'llp' | 'limited_company';

export const TAX_STRUCTURES: Record<TaxStructure, string> = {
  sole_trader: 'Self-employed (sole trader)',
  partnership: 'Partner in a partnership',
  llp: 'Member of an LLP',
  limited_company: 'Limited company',
};

export type TaxProfile = {
  structure: TaxStructure;
  /** Individuals: other taxable income this tax year (a job, a pension, rent). */
  otherIncome: number;
  /** Partners: your share of the profit, 1–100. */
  profitShare: number;
  /** Individuals: Scottish income tax rates. */
  scottish: boolean;
  /** Companies: other companies under the same control (they share the bands). */
  associated: number;
};

export const isCompany = (s: TaxStructure) => s === 'limited_company';

/** The profile as stored, filled in from the books' business type where missing. */
export function readProfile(raw: unknown, businessType: string): TaxProfile {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const structure = (Object.keys(TAX_STRUCTURES) as TaxStructure[]).includes(o.structure as TaxStructure)
    ? (o.structure as TaxStructure)
    : businessType === 'limited_company'
      ? 'limited_company'
      : businessType === 'partnership'
        ? 'partnership'
        : 'sole_trader';
  const int = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
  };
  return {
    structure,
    otherIncome: int(o.otherIncome, 0, 100_000_000_00, 0),
    profitShare: int(o.profitShare, 1, 100, structure === 'sole_trader' || structure === 'limited_company' ? 100 : 50),
    scottish: o.scottish === true,
    associated: int(o.associated, 0, 50, 0),
  };
}

export type PointerKind = 'saving' | 'risk' | 'check' | 'info';

export const POINTER_KINDS: Record<PointerKind, string> = {
  saving: 'Saving',
  risk: 'Risk',
  check: 'Check',
  info: 'Good to know',
};

export type Pointer = {
  key: string;
  kind: PointerKind;
  title: string;
  why: string;
  todo?: string;
  /** Rough tax value in pence; `valueNote` says what it is ("up to", "each £1,000"). */
  value?: number;
  valueNote?: string;
  evidence?: { label: string; href: string }[];
  link: { label: string; href: string };
};

/** One figure from the trial balance for the year. */
export type TbLine = { code: string; name: string; type: string; is_fixed_asset: boolean; debit_pence: number; credit_pence: number };

/** An expense line in the year, for the wording checks. */
export type ExpenseLine = { entry_id: number; date: string; code: string; account: string; text: string; amount: number };

export type TaxInput = {
  profile: TaxProfile;
  rates: TaxYearRates;
  period: { from: string; to: string };
  /** The year is still running (estimates are on profit so far). */
  partYear: boolean;
  tb: TbLine[];
  expenseLines: ExpenseLine[];
  /** Director's loan (2300) balance at the end of the period: + owed TO the director, − owed BY them. */
  directorLoan: number | null;
  overdue: { number: string; due_date: string; outstanding: number }[];
  /** Open invoices at the period end (counted as income, not yet paid). */
  unpaidAtEnd: number;
  firstSale: string | null;
  /** The first entry of any kind in the books. */
  firstEntry: string | null;
  costsBeforeFirstSale: number;
  vatRegistered: boolean;
  farming: boolean;
  /** Gross income from self-employment last tax year, for Making Tax Digital. */
  turnover: number;
};

export type TaxEstimate = {
  income: number;
  expenses: number;
  accountsProfit: number;
  /** Added back: client entertaining isn't allowed. */
  disallowed: number;
  /** Equipment bought (not vehicles), taken off in full (AIA / full expensing). */
  allowances: number;
  taxableProfit: number;
  /** Partners: their share of it. */
  yourProfit: number;
  incomeTax: number;
  class4: number;
  corporationTax: number;
  total: number;
  /** Tax on the next £100 of profit, as a percentage. */
  marginalRate: number;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const gbp = (p: number) => `£${Math.round(p / 100).toLocaleString('en-GB')}`;

const VEHICLES = '0050';
const ENTERTAINMENT = '6960';
const STAFF = '6970';

/** The tax a profit level costs this business (or this partner, on their share). */
function taxOn(profit: number, inp: TaxInput) {
  const { profile, rates } = inp;
  if (isCompany(profile.structure)) {
    const ct = corporationTax(profit, rates, profile.associated);
    return { incomeTax: 0, class4: 0, corporationTax: ct, total: ct };
  }
  const share = Math.round((Math.max(0, profit) * profile.profitShare) / 100);
  const it = incomeTax(share + profile.otherIncome, rates, profile.scottish) - incomeTax(profile.otherIncome, rates, profile.scottish);
  const ni = class4(share, rates);
  return { incomeTax: it, class4: ni, corporationTax: 0, total: it + ni };
}

export function estimate(inp: TaxInput): TaxEstimate {
  const income = sum(inp.tb.filter((r) => r.type === 'income').map((r) => r.credit_pence - r.debit_pence));
  const expenses = sum(inp.tb.filter((r) => r.type === 'expense').map((r) => r.debit_pence - r.credit_pence));
  const disallowed = sum(inp.tb.filter((r) => r.code === ENTERTAINMENT).map((r) => r.debit_pence - r.credit_pence));
  const allowances = Math.max(0, equipmentBought(inp.tb));
  const accountsProfit = income - expenses;
  const taxableProfit = accountsProfit + disallowed - allowances;
  const t = taxOn(taxableProfit, inp);
  const next = taxOn(taxableProfit + 10_000, inp);
  return {
    income,
    expenses,
    accountsProfit,
    disallowed,
    allowances,
    taxableProfit,
    yourProfit: isCompany(inp.profile.structure) ? taxableProfit : Math.round((Math.max(0, taxableProfit) * inp.profile.profitShare) / 100),
    ...t,
    marginalRate: Math.round((next.total - t.total) / 100),
  };
}

/** Fixed assets bought in the year, vehicles aside (they don't get AIA). */
function equipmentBought(tb: TbLine[]): number {
  return sum(tb.filter((r) => r.is_fixed_asset && r.code !== VEHICLES).map((r) => r.debit_pence - r.credit_pence));
}

/** The tax saved by a deduction of `amount` from this year's taxable profit. */
function saving(amount: number, est: TaxEstimate, inp: TaxInput): number {
  if (amount <= 0 || est.taxableProfit <= 0) return 0;
  return taxOn(est.taxableProfit, inp).total - taxOn(Math.max(0, est.taxableProfit - amount), inp).total;
}

const EQUIPMENT_WORDS =
  /\b(laptop|macbook|computer|ipad|tablet|iphone|phone|printer|monitor|tractor|mower|topper|flail|trailer|chainsaw|strimmer|brush ?cutter|harrow|roller|quad|atv|utv|gator|compressor|generator|welder|baler|rake|tedder|spreader|sprayer|loader|bucket|post ?driver|log ?splitter|chipper|leaf ?blower|machine|machinery)\b/i;
/** Accounts where those words are expected: repairs, hire, fuel, motor costs. */
const NOT_EQUIPMENT = new Set(['6150', '5150', '5160', '6320', '6330', '6300']);

const acct = (code: string, p: { from: string; to: string }, label?: string) => ({
  label: label ?? `Account ${code}`,
  href: `/account/books/accounts/${code}?from=${p.from}&to=${p.to}`,
});

/** The pointers for a year's books. */
export function pointers(inp: TaxInput, est = estimate(inp)): Pointer[] {
  const out: Pointer[] = [];
  const { profile, rates, period: p } = inp;
  const company = isCompany(profile.structure);
  const individual = !company;
  const profitable = est.taxableProfit > 0;
  const balanceOf = (code: string) => sum(inp.tb.filter((r) => r.code === code).map((r) => r.debit_pence - r.credit_pence));

  // ── Equipment and vehicles ────────────────────────────────────────────────
  const kit = equipmentBought(inp.tb);
  if (kit > 0) {
    out.push({
      key: 'aia',
      kind: 'saving',
      title: company ? 'Equipment bought: Annual Investment Allowance or full expensing' : 'Equipment bought: Annual Investment Allowance',
      why: `You added ${gbp(kit)} of equipment to your fixed assets this year. Machinery, tools and computers can usually be deducted in full in the year you buy them, up to ${gbp(rates.annualInvestmentAllowance)} a year${company ? '; new equipment can also get full expensing' : ''}. It’s already taken off in the estimate above.`,
      todo: 'Make sure your accountant claims it. Anything bought on finance counts when it’s first used, not when it’s paid off.',
      value: saving(kit, est, inp),
      valueNote: 'about',
      evidence: inp.tb.filter((r) => r.is_fixed_asset && r.code !== VEHICLES && r.debit_pence > 0).map((r) => acct(r.code, p, `${r.code} ${r.name}`)),
      link: { label: 'Annual Investment Allowance', href: 'https://www.gov.uk/capital-allowances/annual-investment-allowance' },
    });
  }
  const vehicles = balanceOf(VEHICLES);
  if (vehicles > 0) {
    out.push({
      key: 'vehicles',
      kind: 'check',
      title: 'Vehicle bought: the allowance depends on what it is',
      why: `${gbp(vehicles)} went on vehicles this year. A van gets the Annual Investment Allowance in full. A new fully electric car gets a 100% first-year allowance. Other cars get ${Math.round(rates.writingDown.main * 100)}% a year (${Math.round(rates.writingDown.special * 100)}% over 50 g/km CO₂). Since April 2025, double-cab pickups count as cars, not vans.${company ? ' A car the director drives privately is also a taxable benefit.' : ' If you use it privately too, only the business share is claimed.'}`,
      todo: 'Tell your accountant the make, model and CO₂ figure, and whether it’s new.',
      evidence: [acct(VEHICLES, p, `${VEHICLES} Motor vehicles`)],
      link: { label: 'Capital allowances on vehicles', href: 'https://www.gov.uk/capital-allowances/business-cars' },
    });
  }
  const kitAsExpense = inp.expenseLines.filter((l) => !NOT_EQUIPMENT.has(l.code) && l.amount >= 20_000 && EQUIPMENT_WORDS.test(l.text));
  if (kitAsExpense.length) {
    out.push({
      key: 'kit-expensed',
      kind: 'check',
      title: 'Equipment that may belong in fixed assets',
      why: `${kitAsExpense.length === 1 ? 'One purchase' : `${kitAsExpense.length} purchases`} (${gbp(sum(kitAsExpense.map((l) => l.amount)))}) in expense accounts sound like equipment that will last more than a year. The tax relief is usually the same, but your accounts should show it as an asset, and selling it later is taxed.`,
      todo: 'If it’s kit you’ll keep, move it to a fixed asset account (void the entry and post it again).',
      evidence: kitAsExpense.slice(0, 6).map((l) => acct(l.code, p, `${l.text.slice(0, 50)} · ${gbp(l.amount)}`)),
      link: { label: 'What counts as a capital expense', href: 'https://www.gov.uk/expenses-if-youre-self-employed' },
    });
  }

  // ── Working from home ─────────────────────────────────────────────────────
  const homeClaimed = inp.expenseLines.some((l) => /\b(use of home|home office|working from home|wfh)\b/i.test(l.text));
  if (!homeClaimed && profitable) {
    const year = company ? rates.homeWorkingWeekly * 52 : rates.homeFlatRate[rates.homeFlatRate.length - 1].monthly * 12;
    out.push({
      key: 'home',
      kind: 'saving',
      title: 'Working from home',
      why: company
        ? `Nothing in the books for working from home this year. The company can pay you ${gbp(rates.homeWorkingWeekly)} a week tax-free for the costs of working from home, without receipts, and deduct it.`
        : `Nothing in the books for working from home this year. If you do your paperwork, quoting and invoicing at home, you can claim a flat rate without receipts: ${rates.homeFlatRate.map((b) => `${gbp(b.monthly)} a month for ${b.hours}`).join(', ')}. Or a share of the actual bills if that’s more.`,
      todo: company ? 'Pay it from the company and record it as an expense.' : 'Record it with Record expense, to General expenses, as “Use of home”.',
      value: saving(year, est, inp),
      valueNote: 'up to',
      link: company
        ? { label: 'Working from home: employer payments', href: 'https://www.gov.uk/expenses-and-benefits-homeworking' }
        : { label: 'Simplified expenses: working from home', href: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/working-from-home' },
    });
  }

  // ── Mileage and motor costs both claimed ──────────────────────────────────
  if (balanceOf('6330') > 0 && balanceOf('6320') > 0) {
    out.push({
      key: 'mileage-and-motor',
      kind: 'check',
      title: 'Mileage and motor costs both claimed',
      why: 'For any one vehicle you claim either the mileage rate or the actual running costs (fuel, servicing, insurance), not both.',
      todo: 'Check the two are for different vehicles.',
      evidence: [acct('6330', p, '6330 Mileage allowance'), acct('6320', p, '6320 Motor expenses')],
      link: { label: 'Vehicle expenses if you’re self-employed', href: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles-' },
    });
  }

  // ── Paying yourself (companies) ───────────────────────────────────────────
  if (company) {
    const salary = inp.expenseLines.some((l) => /\b(salary|salaries|wages|payroll|paye)\b/i.test(l.text));
    if (!salary && profitable) {
      const pa = rates.personalAllowance;
      const ni = Math.max(0, pa - rates.employerNi.threshold) * rates.employerNi.rate;
      const atAllowance = saving(pa, est, inp) - ni;
      const atThreshold = saving(rates.employerNi.threshold, est, inp);
      out.push({
        key: 'salary',
        kind: 'saving',
        title: 'Director’s salary',
        why: `No salary in the books this year. A salary is deducted from the company’s profit, and up to ${gbp(pa)} has no income tax for you if it’s your only income. Above ${gbp(rates.employerNi.threshold)} the company pays employer National Insurance at ${Math.round(rates.employerNi.rate * 100)}%, unless it can claim the Employment Allowance (not when the director is the only employee).`,
        todo: 'Ask your accountant what salary suits you; it has to run through payroll (PAYE).',
        value: Math.max(atAllowance, atThreshold),
        valueNote: 'up to about',
        link: { label: 'Paying yourself as a director', href: 'https://www.gov.uk/running-a-limited-company/taking-money-out-of-a-limited-company' },
      });
    }
    out.push({
      key: 'dividends',
      kind: 'info',
      title: 'Dividends are taxed on you, not the company',
      why: `Profit after corporation tax can be paid out as dividends. The first ${gbp(rates.dividendAllowance)} is tax-free; after that it’s ${pct(rates.dividend.basic)} in the basic band, ${pct(rates.dividend.higher)} higher and ${pct(rates.dividend.additional)} additional. Dividends can only come out of profits left after tax.`,
      link: { label: 'Tax on dividends', href: 'https://www.gov.uk/tax-on-dividends' },
    });
  }

  // ── Director's loan ───────────────────────────────────────────────────────
  if (company && inp.directorLoan !== null) {
    if (inp.directorLoan < 0) {
      const owed = -inp.directorLoan;
      out.push({
        key: 'dla-overdrawn',
        kind: 'risk',
        title: 'You owe the company money (director’s loan overdrawn)',
        why: `At ${ukDate(p.to)} the director’s loan account shows ${gbp(owed)} owed to the company. If it isn’t repaid within nine months of the year end, the company pays ${pct(rates.s455)} tax on it (refunded once repaid). Over £10,000 at any time is also a taxable benefit unless interest is charged.`,
        todo: 'Repay it, or declare a salary or dividend to clear it, before the deadline.',
        value: Math.round(owed * rates.s455),
        valueNote: 'at risk',
        evidence: [acct('2300', p, '2300 Director’s loan account')],
        link: { label: 'Director’s loans', href: 'https://www.gov.uk/directors-loans' },
      });
    } else if (inp.directorLoan > 0) {
      out.push({
        key: 'dla-owed',
        kind: 'info',
        title: 'The company owes you money',
        why: `At ${ukDate(p.to)} the company owes you ${gbp(inp.directorLoan)} on the director’s loan account, for money you’ve put in or costs you paid yourself. Paying it back to you is tax-free, and the company can pay you interest on it (deductible for the company, taxable for you, often within your savings allowance).`,
        evidence: [acct('2300', p, '2300 Director’s loan account')],
        link: { label: 'Director’s loans', href: 'https://www.gov.uk/directors-loans' },
      });
    }
  }

  // ── Pension ───────────────────────────────────────────────────────────────
  if (profitable) {
    out.push({
      key: 'pension',
      kind: 'saving',
      title: company ? 'Company pension contributions' : 'Pension contributions',
      why: company
        ? 'Money the company pays straight into your pension is deducted from its profit and has no National Insurance or income tax for you, within the annual allowance.'
        : 'Paying into a personal pension gets tax relief at your highest rate: basic rate is added by the provider and higher or additional rate is claimed on your tax return. Class 4 National Insurance still applies.',
      todo: 'Talk to your accountant or a financial adviser about how much and when (it counts in the year it’s paid).',
      value: company ? saving(100_000, est, inp) : pensionRelief(100_000, est, inp),
      valueNote: 'for each £1,000 paid in, about',
      link: { label: 'Tax on your private pension contributions', href: 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief' },
    });
  }
  if (individual) {
    const total = est.yourProfit + profile.otherIncome;
    if (total > rates.allowanceTaperFrom && personalAllowanceAt(total, rates) < rates.personalAllowance) {
      const over = Math.min(total - rates.allowanceTaperFrom, (rates.personalAllowance * 2));
      out.push({
        key: 'taper',
        kind: 'saving',
        title: 'Income over £100,000: the 60% band',
        why: `Your income for the year looks like about ${gbp(total)}. Above ${gbp(rates.allowanceTaperFrom)} your personal allowance shrinks by £1 for every £2, so that slice is taxed at around 60%. A pension contribution brings your income back down and restores the allowance.`,
        todo: `A pension contribution of about ${gbp(over)} would take you back to ${gbp(rates.allowanceTaperFrom)}.`,
        value: pensionRelief(over, est, inp),
        valueNote: 'about',
        link: { label: 'Income Tax rates and Personal Allowances', href: 'https://www.gov.uk/income-tax-rates/income-over-100000' },
      });
    }
  }

  // ── Losses ────────────────────────────────────────────────────────────────
  if (est.taxableProfit < 0) {
    out.push({
      key: 'loss',
      kind: 'info',
      title: 'A loss this year',
      why: company
        ? `The books show a tax loss of about ${gbp(-est.taxableProfit)}. A company can set a loss against other profits of the same year, carry it back a year to get tax refunded, or carry it forward against future profits.`
        : `The books show a loss of about ${gbp(-est.taxableProfit)}. You can usually set it against your other income this year or last year (a tax refund), or carry it forward against future profits from the business.`,
      todo: 'Ask your accountant which way gives the most back.',
      link: company
        ? { label: 'Corporation Tax losses', href: 'https://www.gov.uk/guidance/corporation-tax-calculating-and-claiming-a-loss' }
        : { label: 'Losses if you’re self-employed', href: 'https://www.gov.uk/government/publications/losses-hs227-self-assessment-helpsheet' },
    });
  }

  // ── Bad debts and the cash basis ──────────────────────────────────────────
  if (inp.overdue.length) {
    const total = sum(inp.overdue.map((i) => i.outstanding));
    out.push({
      key: 'bad-debts',
      kind: company ? 'saving' : 'check',
      title: 'Invoices more than six months overdue',
      why: company
        ? `${inp.overdue.length === 1 ? 'One invoice is' : `${inp.overdue.length} invoices are`} more than six months overdue (${gbp(total)}). It was counted as income when you invoiced. If it won’t be paid, writing it off as a bad debt takes it back out of your profit.`
        : `${inp.overdue.length === 1 ? 'One invoice is' : `${inp.overdue.length} invoices are`} more than six months overdue (${gbp(total)}). On the cash basis (most sole traders) unpaid invoices were never taxed. If you use the accruals basis, a debt that won’t be paid can be written off.`,
      todo: 'Chase it, or write it off if it’s lost.',
      value: company ? saving(total, est, inp) : undefined,
      valueNote: company ? 'about' : undefined,
      evidence: inp.overdue.slice(0, 6).map((i) => ({ label: `Invoice ${i.number} · ${gbp(i.outstanding)}`, href: '/account/books/invoices' })),
      link: { label: 'Bad debts', href: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim42700' },
    });
  }
  if (individual && inp.unpaidAtEnd > 0 && !inp.partYear) {
    out.push({
      key: 'cash-basis',
      kind: 'info',
      title: 'Unpaid invoices at the year end',
      why: `Books counts an invoice as income when you send it. Most sole traders and partnerships are taxed on the cash basis, where only money actually received counts: ${gbp(inp.unpaidAtEnd)} unpaid at the year end would then be taxed next year instead.`,
      todo: 'Tell your accountant which basis you use.',
      link: { label: 'Cash basis', href: 'https://www.gov.uk/simpler-income-tax-cash-basis' },
    });
  }

  // ── Entertainment and staff ───────────────────────────────────────────────
  const ent = balanceOf(ENTERTAINMENT);
  if (ent > 0) {
    out.push({
      key: 'entertainment',
      kind: 'check',
      title: 'Entertainment isn’t deductible',
      why: `${gbp(ent)} of entertainment this year. Entertaining customers isn’t allowed for tax (it’s added back in the estimate above), and its VAT can’t be reclaimed. Staff events are different: they’re deductible, and up to ${gbp(rates.staffPartyPerHead)} a head a year is tax-free for the staff.`,
      todo: 'Move anything that was for your own staff to Staff welfare.',
      evidence: [acct(ENTERTAINMENT, p, '6960 Entertainment')],
      link: { label: 'Business entertainment', href: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim45000' },
    });
  }
  if (balanceOf(STAFF) > 0) {
    out.push({
      key: 'staff',
      kind: 'info',
      title: 'Staff benefits with no tax',
      why: `A yearly party or event up to ${gbp(rates.staffPartyPerHead)} a head, and gifts up to ${gbp(rates.trivialBenefit)} that aren’t cash or a reward for work (trivial benefits), are tax-free for staff and still deductible for you.`,
      evidence: [acct(STAFF, p, '6970 Staff welfare')],
      link: { label: 'Trivial benefits', href: 'https://www.gov.uk/expenses-and-benefits-trivial-benefits' },
    });
  }

  // ── Starting out ──────────────────────────────────────────────────────────
  // Only where the books look like a business starting up: a month or more of
  // costs before any sale. New books for an established business start with
  // a few days of costs too, and that isn't pre-trading.
  if (
    inp.costsBeforeFirstSale > 0 &&
    inp.firstSale &&
    inp.firstEntry &&
    inp.firstSale >= p.from &&
    inp.firstSale <= p.to &&
    addDays(inp.firstEntry, 30) < inp.firstSale
  ) {
    out.push({
      key: 'pre-trading',
      kind: 'info',
      title: 'Costs from before you started trading',
      why: `${gbp(inp.costsBeforeFirstSale)} was spent before your first sale on ${ukDate(inp.firstSale)}. If that’s when you started trading, costs from up to seven years before trading starts are treated as if spent on the first day, so they still count.`,
      link: { label: 'Pre-trading expenditure', href: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim46351' },
    });
  }
  if (individual && !inp.partYear && est.income > 0 && est.income <= rates.tradingAllowance) {
    out.push({
      key: 'trading-allowance',
      kind: 'info',
      title: 'Trading allowance',
      why: `Your income from the business is ${gbp(est.income)}. The first ${gbp(rates.tradingAllowance)} of trading income a year is tax-free and doesn’t need reporting, if you don’t claim the expenses instead.`,
      link: { label: 'Tax-free allowances on trading income', href: 'https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income' },
    });
  }

  // ── Paying and reporting ──────────────────────────────────────────────────
  if (individual) {
    if (est.total > rates.paymentsOnAccountFrom) {
      out.push({
        key: 'payments-on-account',
        kind: 'info',
        title: 'Payments on account',
        why: `With a Self Assessment bill over ${gbp(rates.paymentsOnAccountFrom)}, HMRC usually asks for half of next year’s bill in advance as well: on 31 January and 31 July. The first year this happens, January’s payment can be one and a half years’ tax.`,
        todo: `Set aside about ${gbp(est.total)} for this year, and keep some back for the advance payments.`,
        link: { label: 'Payments on account', href: 'https://www.gov.uk/understand-self-assessment-bill/payments-on-account' },
      });
    }
    if (profile.structure === 'sole_trader') {
      const mtd = mtdPointer(inp.turnover);
      if (mtd) out.push(mtd);
    }
    if (profile.structure !== 'sole_trader') {
      out.push({
        key: 'partners',
        kind: 'info',
        title: 'Each partner is taxed on their own share',
        why: `The figures here are for your ${profile.profitShare}% share. The ${profile.structure === 'llp' ? 'LLP' : 'partnership'} sends its own return showing every partner’s share, and each partner pays income tax and Class 4 National Insurance on theirs through their own Self Assessment.`,
        link: { label: 'Partnerships and tax', href: 'https://www.gov.uk/set-up-business-partnership/partnership-tax' },
      });
    }
  }
  if (company) {
    if (profile.associated > 0) {
      out.push({
        key: 'associated',
        kind: 'info',
        title: 'Associated companies share the corporation tax limits',
        why: `With ${profile.associated} associated ${profile.associated === 1 ? 'company' : 'companies'}, the ${gbp(rates.corporationTax.lower)} small profits limit and ${gbp(rates.corporationTax.upper)} main rate limit are divided by ${profile.associated + 1}, which the estimate above already does.`,
        link: { label: 'Corporation Tax rates and associated companies', href: 'https://www.gov.uk/guidance/corporation-tax-marginal-relief' },
      });
    }
    out.push({
      key: 'ct-due',
      kind: 'info',
      title: 'When corporation tax is due',
      why: 'Corporation tax is due 9 months and 1 day after the end of the company’s accounting year, before the return (due 12 months after). Companies with profits over £1.5 million pay in quarterly instalments.',
      link: { label: 'Pay Corporation Tax', href: 'https://www.gov.uk/pay-corporation-tax' },
    });
  }

  // ── VAT ───────────────────────────────────────────────────────────────────
  if (!inp.vatRegistered) {
    out.push({
      key: 'vat-pre-reg',
      kind: 'info',
      title: 'If you register for VAT',
      why: 'When you register, you can reclaim VAT on goods you still have that were bought in the four years before, and on services from the six months before. The VAT page keeps track of what you could claim and how close you are to the threshold.',
      evidence: [{ label: 'VAT page', href: '/account/books/vat' }],
      link: { label: 'Reclaiming VAT from before registration', href: 'https://www.gov.uk/vat-registration/purchases-made-before-registration' },
    });
  }

  // ── Farming ───────────────────────────────────────────────────────────────
  if (inp.farming) {
    if (individual) {
      out.push({
        key: 'farmers-averaging',
        kind: 'info',
        title: 'Farmers’ averaging',
        why: 'Farming profits that swing from year to year can be averaged over two or five years, so a good year isn’t taxed at the higher rate while a poor one wastes your allowance. Contracting counts only where it’s part of a farming trade.',
        link: { label: 'Averaging for farmers', href: 'https://www.gov.uk/guidance/averaging-for-farmers-and-creative-artists' },
      });
    }
    if (balanceOf('5140') > 0 || inp.tb.some((r) => r.code === '4100' && r.credit_pence > 0)) {
      out.push({
        key: 'herd-basis',
        kind: 'info',
        title: 'Herd basis election',
        why: 'If you keep a production herd (breeding or dairy animals), electing for the herd basis treats it like a capital asset: selling the whole herd later isn’t taxed as trading income. The election has to be made within two years of the herd starting.',
        link: { label: 'Herd basis', href: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim55501' },
      });
    }
    out.push({
      key: 'sba',
      kind: 'info',
      title: 'Buildings: Structures and Buildings Allowance',
      why: 'New farm buildings and work on them (barns, sheds, hard standing; not houses) can get 3% of the cost a year for 33⅓ years. Land and the house don’t qualify.',
      link: { label: 'Structures and Buildings Allowance', href: 'https://www.gov.uk/guidance/claiming-capital-allowances-for-structures-and-buildings' },
    });
  }

  return out;
}

/** Relief on a personal pension contribution: income tax only (Class 4 stays). */
function pensionRelief(amount: number, est: TaxEstimate, inp: TaxInput): number {
  const { profile, rates } = inp;
  const total = est.yourProfit + profile.otherIncome;
  if (total <= 0) return 0;
  // The contribution extends the bands (and restores the allowance via adjusted net income).
  return incomeTax(total, rates, profile.scottish) - incomeTax(Math.max(0, total - amount), rates, profile.scottish);
}

/**
 * Making Tax Digital for Income Tax: quarterly updates through software, from
 * the tax year after the one tested. Gross self-employment and property
 * income: over £50,000 from April 2026, £30,000 from April 2027, £20,000 from
 * April 2028.
 */
export function mtdPointer(turnover: number): Pointer | null {
  if (turnover <= 2_000_000) return null;
  const from = turnover > 5_000_000 ? 'April 2026' : turnover > 3_000_000 ? 'April 2027' : 'April 2028';
  return {
    key: 'mtd',
    kind: 'info',
    title: `Making Tax Digital for Income Tax from ${from}`,
    why: `Your takings are about ${gbp(turnover)} a year. Self-employed people (with property income added in) over £50,000 have had to keep digital records and send quarterly updates from April 2026; the limit drops to £30,000 from April 2027 and £20,000 from April 2028. It’s tested on the income of an earlier tax year.`,
    todo: 'Books keeps the digital records, but doesn’t send the updates to HMRC: you or your accountant need MTD software for that.',
    link: { label: 'Making Tax Digital for Income Tax', href: 'https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax' },
  };
}

const pct = (r: number) => `${Math.round(r * 10_000) / 100}%`;
