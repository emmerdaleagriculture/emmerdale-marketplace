/**
 * Ask: the read-only tools the model answers from, and the pure sums behind
 * them. The model picks dates and filters; it never names whose data to read
 * (askTools.server.ts binds every call to the signed-in contractor), and it
 * never adds up: totals come back worked out, in pounds.
 */

import type Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';

const pounds = (pence: number) => Math.round(pence) / 100;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const TOOL_INPUTS = {
  account_totals: z.object({ from: date, to: date }),
  ledger_lines: z.object({
    account_code: z.string().max(10).nullable(),
    account_type: z.enum(['income', 'expense', 'asset', 'liability', 'equity']).nullable(),
    search: z.string().max(80).nullable(),
    from: date,
    to: date,
    group_by: z.enum(['none', 'counterparty', 'month', 'account']),
  }),
  invoices: z.object({ show: z.enum(['unpaid', 'overdue', 'paid', 'all']), from: date, to: date }),
  marketplace_jobs: z.object({ from: date, to: date }),
  marketplace_activity: z.object({ from: date, to: date }),
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;
export const isToolName = (n: string): n is ToolName => n in TOOL_INPUTS;

const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD, or null for no limit' };
const range = { from: DATE, to: DATE };

/** What a tool call looks like to the person waiting. */
export const TOOL_STATUS: Record<ToolName, string> = {
  account_totals: 'Adding up your accounts…',
  ledger_lines: 'Looking through your books…',
  invoices: 'Checking your invoices…',
  marketplace_jobs: 'Looking at your Emmerdale jobs…',
  marketplace_activity: 'Counting your invitations and prices…',
};

export const ASK_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'account_totals',
    description:
      'Totals for every account in the books over a date range: income, expenses and profit for the period, and each account’s balance. With from null, balances are as at `to` (use that for bank balance, money owed, VAT owed). Use this first for "how much did I make/spend" questions.',
    strict: true,
    input_schema: { type: 'object', properties: range, required: ['from', 'to'], additionalProperties: false },
  },
  {
    name: 'ledger_lines',
    description:
      'Individual transactions from the books, filtered and totalled. Every transaction has one line per account it touches (an expense, its VAT, the bank), so to total spending set account_type "expense" (or an account_code), and for sales "income"; otherwise the same money is counted twice. `search` matches the supplier or customer name, description, reference and memo. group_by returns totals per supplier/customer, per month or per account instead of a flat list. Returns totals over everything matched and the latest 50 lines.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        account_code: { type: ['string', 'null'], description: 'One account code from the chart, or null' },
        account_type: { anyOf: [{ type: 'string', enum: ['income', 'expense', 'asset', 'liability', 'equity'] }, { type: 'null' }] },
        search: { type: ['string', 'null'], description: 'Text to find, or null' },
        ...range,
        group_by: { type: 'string', enum: ['none', 'counterparty', 'month', 'account'] },
      },
      required: ['account_code', 'account_type', 'search', 'from', 'to', 'group_by'],
      additionalProperties: false,
    },
  },
  {
    name: 'invoices',
    description:
      'Sales invoices the business has issued from Books, with the customer, dates, amount, amount paid and amount still owed. The date range is on the invoice date. Use for "who owes me money" and "what have I invoiced".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { show: { type: 'string', enum: ['unpaid', 'overdue', 'paid', 'all'] }, ...range },
      required: ['show', 'from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'marketplace_jobs',
    description:
      'Jobs this contractor has won through the Emmerdale marketplace (awarded in the date range): service, area, status, the contractor’s price and what Emmerdale has paid out so far.',
    strict: true,
    input_schema: { type: 'object', properties: range, required: ['from', 'to'], additionalProperties: false },
  },
  {
    name: 'marketplace_activity',
    description:
      'Counts of this contractor’s Emmerdale marketplace activity in a date range: job invitations received, opened and passed on, prices given, and jobs won.',
    strict: true,
    input_schema: { type: 'object', properties: range, required: ['from', 'to'], additionalProperties: false },
  },
];

export type AskLine = {
  entry_id: number;
  entry_date: string;
  account_code: string;
  account_name: string;
  account_type: string;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  memo: string | null;
  debit_pence: number;
  credit_pence: number;
};

/** A line's amount the way its account reads: spending and assets up on a debit, income and what's owed up on a credit. */
const natural = (l: AskLine) => (l.account_type === 'asset' || l.account_type === 'expense' ? l.debit_pence - l.credit_pence : l.credit_pence - l.debit_pence);

const MAX_LINES = 50;
const MAX_GROUPS = 40;

export function summariseLines(
  rows: AskLine[],
  opts: { search?: string | null; accountType?: string | null; groupBy: 'none' | 'counterparty' | 'month' | 'account' },
) {
  const needle = opts.search?.trim().toLowerCase();
  const matched = rows.filter(
    (l) =>
      (!opts.accountType || l.account_type === opts.accountType) &&
      (!needle || [l.counterparty, l.description, l.reference, l.memo].some((f) => f?.toLowerCase().includes(needle))),
  );
  const debit = matched.reduce((t, l) => t + l.debit_pence, 0);
  const credit = matched.reduce((t, l) => t + l.credit_pence, 0);
  const types = new Set(matched.map((l) => l.account_type));
  // One kind of account: the total reads naturally. Mixed kinds: debits less credits, and say so.
  const oneKind = types.size <= 1;
  const totals = {
    lines_matched: matched.length,
    debits: pounds(debit),
    credits: pounds(credit),
    total: pounds(oneKind ? matched.reduce((t, l) => t + natural(l), 0) : debit - credit),
    total_means: oneKind ? `net amount for ${[...types][0] ?? 'no'} accounts` : 'debits less credits across mixed account types; filter by account_type for a meaningful total',
  };
  if (opts.groupBy !== 'none') {
    const keyOf = (l: AskLine) =>
      opts.groupBy === 'month' ? l.entry_date.slice(0, 7) : opts.groupBy === 'account' ? `${l.account_code} ${l.account_name}` : l.counterparty?.trim() || '(no name)';
    const groups = new Map<string, { lines: number; pence: number }>();
    for (const l of matched) {
      const g = groups.get(keyOf(l)) ?? { lines: 0, pence: 0 };
      g.lines++;
      g.pence += oneKind ? natural(l) : l.debit_pence - l.credit_pence;
      groups.set(keyOf(l), g);
    }
    const all = [...groups.entries()].map(([key, g]) => ({ key, lines: g.lines, total: pounds(g.pence) }));
    all.sort((a, b) => (opts.groupBy === 'month' ? a.key.localeCompare(b.key) : Math.abs(b.total) - Math.abs(a.total)));
    return { ...totals, groups: all.slice(0, MAX_GROUPS), groups_not_shown: Math.max(0, all.length - MAX_GROUPS) };
  }
  const latest = [...matched].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.entry_id - a.entry_id).slice(0, MAX_LINES);
  return {
    ...totals,
    lines: latest.map((l) => ({
      date: l.entry_date,
      account: `${l.account_code} ${l.account_name}`,
      who: l.counterparty,
      what: l.description ?? l.memo,
      ref: l.reference,
      amount: pounds(natural(l)),
    })),
    lines_not_shown: Math.max(0, matched.length - MAX_LINES),
  };
}

export type AskTbRow = { code: string; name: string; type: string; debit_pence: number; credit_pence: number };

export function summariseTotals(rows: AskTbRow[]) {
  const bal = (r: AskTbRow) => (r.type === 'asset' || r.type === 'expense' ? r.debit_pence - r.credit_pence : r.credit_pence - r.debit_pence);
  const sum = (type: string) => rows.filter((r) => r.type === type).reduce((t, r) => t + bal(r), 0);
  const income = sum('income');
  const expenses = sum('expense');
  return {
    income: pounds(income),
    expenses: pounds(expenses),
    profit: pounds(income - expenses),
    accounts: rows.filter((r) => bal(r) !== 0).map((r) => ({ code: r.code, name: r.name, type: r.type, balance: pounds(bal(r)) })),
  };
}
