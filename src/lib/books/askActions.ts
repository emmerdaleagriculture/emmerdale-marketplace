/**
 * Ask: the changes it can make to the books. The model never writes: it
 * calls one of these tools to *prepare* a change, which is checked against
 * the books and shown to the member with what it will do. Nothing is
 * recorded until the member confirms it (askActions.server.ts).
 *
 * These tools are not `strict`: with the read tools' strict schemas the
 * request's compiled grammar is already near the API's size limit, and every
 * input is checked here (ACTION_INPUTS) and against the books before anything
 * is offered. "Not given" is an empty string or 0, never null.
 */

import type Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const code = z.string().regex(/^(\d{4})?$/);
const money = z.number().min(0).max(10_000_000);
const PURCHASE_VAT = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE', 'BLOCKED'] as const;
const SALE_VAT = ['STD', 'RED', 'ZERO', 'EXEMPT', 'OUTSIDE'] as const;
const METHODS = ['bank', 'stripe', 'owner', 'cash'] as const;

export const ACTION_INPUTS = {
  record_expense: z.object({
    date,
    supplier: z.string().max(200),
    description: z.string().max(300),
    total: money,
    vat: money,
    vat_code: z.enum(PURCHASE_VAT),
    category_code: z.string().regex(/^\d{4}$/),
    paid_from_code: code,
  }),
  record_income: z.object({
    date,
    customer: z.string().max(200),
    description: z.string().max(300),
    total: money,
    vat: money,
    vat_code: z.enum(SALE_VAT),
    category_code: z.string().regex(/^\d{4}$/),
    paid_into_code: code,
  }),
  record_mileage: z.object({
    date,
    driver: z.string().max(100),
    miles: z.number().positive().max(2000),
    journey: z.string().max(200),
    purpose: z.string().max(200),
  }),
  add_customer: z.object({
    name: z.string().trim().min(1).max(200),
    organisation: z.string().max(200),
    email: z.string().max(200),
    phone: z.string().max(40),
    address: z.string().max(500),
  }),
  draft_invoice: z.object({
    customer_id: z.number().int().min(0),
    new_customer_name: z.string().max(200),
    new_customer_email: z.string().max(200),
    issue_date: date,
    due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    notes: z.string().max(1000),
    lines: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(500),
          quantity: z.number().positive().max(1_000_000),
          unit_price: money,
          vat_code: z.enum(SALE_VAT),
          income_code: z.string().regex(/^\d{4}$/),
        }),
      )
      .min(1)
      .max(20),
  }),
  record_invoice_payment: z.object({
    invoice_number: z.string().min(1).max(20),
    amount: money,
    paid_on: date,
    method: z.enum(METHODS),
    reference: z.string().max(100),
  }),
  remove_entry: z.object({ entry_id: z.number().int().positive() }),
  add_category: z.object({
    code: z.string().regex(/^\d{4}$/),
    name: z.string().trim().min(1).max(120),
    type: z.enum(['income', 'expense']),
  }),
} as const;

export type ActionKind = keyof typeof ACTION_INPUTS;
export type ActionInput<K extends ActionKind> = z.infer<(typeof ACTION_INPUTS)[K]>;
export const isActionKind = (n: string): n is ActionKind => Object.prototype.hasOwnProperty.call(ACTION_INPUTS, n);

/** What preparing a change looks like to the person waiting. */
export const ACTION_STATUS: Record<ActionKind, string> = {
  record_expense: 'Setting up the expense…',
  record_income: 'Setting up the money in…',
  record_mileage: 'Working out the mileage…',
  add_customer: 'Setting up the customer…',
  draft_invoice: 'Drafting the invoice…',
  record_invoice_payment: 'Setting up the payment…',
  remove_entry: 'Finding that entry…',
  add_category: 'Setting up the category…',
};

/** Changes one question may prepare. */
export const MAX_ACTIONS_PER_QUESTION = 3;

const S = { type: 'string' } as const;
const N = { type: 'number' } as const;
const D = { type: 'string', description: 'YYYY-MM-DD' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object' as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const PREPARES = 'Prepares the change and shows it to the person with a Confirm button; it is NOT recorded until they confirm.';

export const ACTION_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'record_expense',
    description: `${PREPARES} Records money the business spent (a purchase already paid, or owed with paid_from_code 2100). Needs at least the amount, who it was paid to or what it was for, and the date (today if they say "today" or give none for something just bought).`,
    input_schema: obj({
      date: D,
      supplier: { ...S, description: 'Who was paid, or "" if not known' },
      description: { ...S, description: 'What it was for, a few words' },
      total: { ...N, description: 'Amount paid in pounds, including any VAT' },
      vat: { ...N, description: 'VAT included in the total, in pounds. 0 if there is none, it is unknown, or the business is not VAT registered and no VAT figure was given' },
      vat_code: { type: 'string', enum: PURCHASE_VAT, description: 'STD when 20% VAT is included, RED for 5%, ZERO/EXEMPT when the goods are, BLOCKED for VAT that cannot be reclaimed (entertaining), OUTSIDE when no VAT was charged or it is unknown' },
      category_code: { ...S, description: 'The expense (or fixed asset) account code from the chart that fits best' },
      paid_from_code: { ...S, description: 'Account code it was paid from, or "" for the usual account' },
    }),
  },
  {
    name: 'record_income',
    description: `${PREPARES} Records money the business received for a sale that was not invoiced through Books (cash job, direct bank payment). For work that needs an invoice use draft_invoice; for a payment of an existing invoice use record_invoice_payment.`,
    input_schema: obj({
      date: D,
      customer: { ...S, description: 'Who paid, or ""' },
      description: { ...S, description: 'What it was for, a few words' },
      total: { ...N, description: 'Amount received in pounds, including any VAT' },
      vat: { ...N, description: 'VAT included in the total, in pounds; 0 if none or the business is not VAT registered' },
      vat_code: { type: 'string', enum: SALE_VAT, description: 'STD when 20% VAT is included; OUTSIDE when there is no VAT' },
      category_code: { ...S, description: 'The income account code from the chart that fits best' },
      paid_into_code: { ...S, description: 'Account code it was paid into, or "" for the usual account' },
    }),
  },
  {
    name: 'record_mileage',
    description: `${PREPARES} Claims business miles driven in the owner's or an employee's own vehicle at the HMRC rate (worked out for you). Needs the miles, the date and who drove.`,
    input_schema: obj({
      date: D,
      driver: { ...S, description: 'Name of the person who drove' },
      miles: { ...N, description: 'Business miles, up to one decimal place' },
      journey: { ...S, description: 'From and to, or ""' },
      purpose: { ...S, description: 'Why, or ""' },
    }),
  },
  {
    name: 'add_customer',
    description: `${PREPARES} Adds a customer to Books so they can be invoiced. Check with the customers tool first that they are not already there. To invoice a new customer, draft_invoice can add them in the same step.`,
    input_schema: obj({
      name: { ...S, description: 'The person’s name (or the business name if there is no person)' },
      organisation: { ...S, description: 'Business name, or ""' },
      email: { ...S, description: 'Email, or ""' },
      phone: { ...S, description: 'Phone, or ""' },
      address: { ...S, description: 'Postal address, or ""' },
    }),
  },
  {
    name: 'draft_invoice',
    description: `${PREPARES} Creates a draft sales invoice for the person to check and send from Books. Look the customer up with the customers tool first: pass their id, or 0 with new_customer_name to add a new customer. VAT is worked out for you from each line’s vat_code (and left off if the business is not VAT registered); unit_price is before VAT.`,
    input_schema: obj({
      customer_id: { ...N, description: 'Customer id from the customers tool, or 0 for a new customer' },
      new_customer_name: { ...S, description: 'Name for a new customer, or "" when customer_id is given' },
      new_customer_email: { ...S, description: 'Email for a new customer, or ""' },
      issue_date: { ...D, description: 'Invoice date, YYYY-MM-DD (today unless they say otherwise)' },
      due_date: { ...S, description: 'YYYY-MM-DD, or "" to use the business’s usual payment terms' },
      notes: { ...S, description: 'Note to print on the invoice, or ""' },
      lines: {
        type: 'array',
        items: obj({
          description: S,
          quantity: { ...N, description: 'e.g. acres, hours, bales; 1 for a fixed price' },
          unit_price: { ...N, description: 'Price per unit in pounds, before VAT' },
          vat_code: { type: 'string', enum: SALE_VAT, description: 'STD unless they say otherwise' },
          income_code: { ...S, description: 'The income account code from the chart that fits best' },
        }),
      },
    }),
  },
  {
    name: 'record_invoice_payment',
    description: `${PREPARES} Marks money received against an invoice issued from Books. Find the invoice with the invoices tool first and use its number and the amount still owed.`,
    input_schema: obj({
      invoice_number: S,
      amount: { ...N, description: 'Amount received, in pounds' },
      paid_on: D,
      method: { type: 'string', enum: METHODS, description: 'bank transfer unless they say card (stripe), cash, or paid to the owner personally (owner)' },
      reference: { ...S, description: 'Payment reference, or ""' },
    }),
  },
  {
    name: 'remove_entry',
    description: `${PREPARES} Takes one entry out of the books (to undo a mistake or a duplicate). Find it with ledger_lines first and pass its entry number. Only entries typed in by hand, mileage claims, receipts and bank statement rows can be removed; invoices and Emmerdale jobs cannot.`,
    input_schema: obj({ entry_id: { ...N, description: 'The entry number from ledger_lines' } }),
  },
  {
    name: 'add_category',
    description: `${PREPARES} Adds a new income or expense account to the chart, for when nothing in the chart fits. Pick an unused four-digit code near similar accounts (4xxx income, 5xxx–7xxx expenses).`,
    input_schema: obj({
      code: { ...S, description: 'Four digits, not already in the chart' },
      name: S,
      type: { type: 'string', enum: ['income', 'expense'] },
    }),
  },
];

/**
 * Not a change to the books: takes back a change prepared earlier in the
 * conversation that the person hasn't confirmed, when they've changed their
 * mind or asked for it to be set up differently.
 */
export const WITHDRAW_TOOL: Anthropic.Beta.BetaTool = {
  name: 'withdraw_change',
  description:
    'Withdraws a change prepared earlier in this conversation that is still waiting for the person to confirm, so they cannot confirm it by mistake. Use it when they ask for that change to be set up differently (withdraw the old one, then prepare the new one) or say they no longer want it. The number is in the list of changes prepared earlier.',
  input_schema: obj({ change: { ...N, description: 'The number of the change, from the list of changes prepared earlier' } }),
};

export type ActionSummary = { title: string; lines: string[] };
export type ActionResult = { message: string; href: string | null };
export type ActionStatus = 'pending' | 'running' | 'done' | 'cancelled';

/** A prepared change as the page shows it. */
export type AskActionView = {
  id: number;
  kind: string;
  title: string;
  lines: string[];
  status: ActionStatus;
  message: string | null;
  href: string | null;
  error: string | null;
  /** Its confirmation never finished: it may or may not have been recorded. */
  stuck?: boolean;
};

type ActionRow = { id: number; kind: string; summary: unknown; status: string; result: unknown; error: string | null };

export function actionView(r: ActionRow): AskActionView {
  const summary = (r.summary ?? {}) as Partial<ActionSummary>;
  const result = (r.result ?? null) as Partial<ActionResult> | null;
  return {
    id: r.id,
    kind: r.kind,
    title: typeof summary.title === 'string' ? summary.title : 'Change to your books',
    lines: Array.isArray(summary.lines) ? summary.lines.filter((l): l is string => typeof l === 'string') : [],
    status: (['pending', 'running', 'done', 'cancelled'] as const).includes(r.status as ActionStatus) ? (r.status as ActionStatus) : 'cancelled',
    message: typeof result?.message === 'string' ? result.message : null,
    href: typeof result?.href === 'string' ? result.href : null,
    error: r.error,
  };
}

/** One line per prepared change, for the model's context on a follow-up: what it set up and what became of it. */
export function actionNote(a: AskActionView): string {
  const what = `Change ${a.id}: ${[a.title, ...a.lines.slice(0, 2)].join('; ')}`;
  const state =
    a.status === 'done'
      ? `confirmed and done${a.message ? ` (${a.message})` : ''}`
      : a.status === 'cancelled'
        ? 'turned down by the person, not done'
        : a.status === 'running'
          ? 'being recorded now'
          : 'still waiting for the person to confirm, not done';
  return `- ${what}: ${state}`;
}
