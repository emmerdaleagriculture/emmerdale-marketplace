import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { ACTION_INPUTS, MAX_ACTIONS_PER_QUESTION, actionView, isActionKind, type ActionInput, type ActionKind, type ActionResult, type ActionSummary, type AskActionView } from './askActions';
import { PAYMENT_METHODS, amountDue, priceLine, invoiceTotals, type InvoiceLine } from './invoice';
import { createDraftInvoice, loadInvoice, recordPayment } from './invoices.server';
import { formatPence, parsePounds } from './money';
import { addDays, isIsoDate, todayUk, ukDate } from './period';
import type { PostableDoc, Posting } from './posting';
import { checkDocument, checkMileage, postEntry, type Checked } from './record.server';
import { VOIDABLE_SOURCES, getAccounts, voidEntry, type BooksAccount, type Ledger } from './server';
import { expireInvoiceSession } from './stripeConnect';
import { VAT_CODES, isVatCode, registeredOn } from './vat';

/**
 * Ask's changes to the books, in two steps. `proposeAction` (called by the
 * model's tool call) checks the request against the books exactly as the
 * form would and saves it as a pending action with a plain summary; it
 * writes nothing to the books. `confirmAction` (the member's tap) checks it
 * again and does it, through the same code the forms use. The ledger always
 * comes from the signed-in session, never from the model.
 */

const NO_BOOKS = 'This business has not set up its books yet, so there is nothing to change. They can set them up under Books.';
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const pence = (pounds: number) => parsePounds(pounds) ?? 0;
const named = (accounts: BooksAccount[], code: string) => {
  const a = accounts.find((x) => x.code === code);
  return a ? `${a.code} ${a.name}` : code;
};

/** What a checked change needs to be carried out: a summary to show, and `run` to do it. */
type Plan = { summary: ActionSummary; run: () => Promise<{ ok: true; result: ActionResult } | { ok: false; error: string }> };

async function planDocument(ledger: Ledger, kind: 'purchase' | 'sale', i: ActionInput<'record_expense'> | ActionInput<'record_income'>): Promise<Checked<Plan>> {
  const who = 'supplier' in i ? i.supplier : i.customer;
  const payCode = ('paid_from_code' in i ? i.paid_from_code : i.paid_into_code) || ledger.default_payment_account;
  const doc: PostableDoc = {
    kind,
    date: i.date,
    counterparty: who,
    reference: '',
    description: i.description,
    currency: ledger.base_currency,
    net: null,
    vat: pence(i.vat),
    gross: pence(i.total),
    vatCode: i.vat_code,
    accountCode: i.category_code,
    paymentCode: payCode,
  };
  if (!isIsoDate(i.date)) return bad('That date is not a real date.');
  if (i.date > addDays(todayUk(), 366)) return bad('That date is more than a year ahead.');
  const checked = await checkDocument(ledger, doc);
  if (!checked.ok) return checked;
  const posting: Posting = { ...checked.value, entry: { ...checked.value.entry, meta: { via: 'ask' } } };
  const accounts = await getAccounts(ledger.id);
  const e = posting.entry;
  const lines = [
    `${formatPence(e.gross_pence)}${who.trim() ? ` ${kind === 'purchase' ? 'to' : 'from'} ${who.trim()}` : ''} on ${ukDate(e.entry_date)}`,
    ...(i.description.trim() ? [i.description.trim()] : []),
    `Category: ${named(accounts, i.category_code)}`,
    `${kind === 'purchase' ? 'Paid from' : 'Paid into'}: ${named(accounts, payCode)}`,
    ...(e.vat_pence > 0 && isVatCode(e.vat_code) ? [`VAT: ${formatPence(e.vat_pence)} (${VAT_CODES[e.vat_code].label})`] : []),
  ];
  return {
    ok: true,
    value: {
      summary: { title: kind === 'purchase' ? 'Record an expense' : 'Record money in', lines },
      run: async () => {
        const done = await postEntry(ledger.id, posting);
        if (!done.ok) return done;
        return { ok: true, result: { message: `Recorded as entry #${done.entryId}.`, href: '/account/books/journal' } };
      },
    },
  };
}

async function planMileage(ledger: Ledger, i: ActionInput<'record_mileage'>): Promise<Checked<Plan>> {
  const checked = await checkMileage(ledger, { date: i.date, driver: i.driver, miles: i.miles, journey: i.journey, purpose: i.purpose, payCode: '', odometer: null });
  if (!checked.ok) return checked;
  const posting: Posting = { ...checked.value, entry: { ...checked.value.entry, meta: { ...checked.value.entry.meta, via: 'ask' } } };
  const e = posting.entry;
  return {
    ok: true,
    value: {
      summary: {
        title: 'Claim mileage',
        lines: [`${i.miles.toLocaleString('en-GB')} miles on ${ukDate(i.date)}, driven by ${i.driver.trim()}`, `Claim: ${formatPence(e.gross_pence)}`, ...[i.journey.trim(), i.purpose.trim()].filter(Boolean)],
      },
      run: async () => {
        const done = await postEntry(ledger.id, posting);
        if (!done.ok) return done;
        return { ok: true, result: { message: `Claimed ${formatPence(e.gross_pence)} as entry #${done.entryId}.`, href: '/account/books/mileage' } };
      },
    },
  };
}

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function planCustomer(ledger: Ledger, i: ActionInput<'add_customer'>): Promise<Checked<Plan>> {
  const email = i.email.trim().toLowerCase();
  if (email && !validEmail(email)) return bad('That email address is not valid.');
  const admin = createServiceRoleClient();
  const { data: same } = await admin.from('books_customers').select('id, name').eq('ledger_id', ledger.id).ilike('name', i.name.replace(/[%_\\]/g, '\\$&')).limit(1);
  if (same?.length) return bad(`There is already a customer called ${same[0].name} (id ${same[0].id}).`);
  const row = {
    name: i.name,
    organisation: i.organisation.trim() || null,
    email: email || null,
    phone: i.phone.trim() || null,
    address: i.address.trim() || null,
  };
  return {
    ok: true,
    value: {
      summary: { title: 'Add a customer', lines: [row.name, row.organisation, row.email, row.phone, row.address].filter((x): x is string => Boolean(x)) },
      run: async () => {
        const { error } = await admin.from('books_customers').insert({ ledger_id: ledger.id, ...row });
        if (error) return bad('The customer didn’t save. Please try again.');
        return { ok: true, result: { message: `${row.name} added to your customers.`, href: '/account/books/customers' } };
      },
    },
  };
}

async function planInvoice(ledger: Ledger, i: ActionInput<'draft_invoice'>): Promise<Checked<Plan>> {
  const admin = createServiceRoleClient();
  if (!isIsoDate(i.issue_date)) return bad('The invoice date is not a real date.');
  const dueDate = i.due_date || addDays(i.issue_date, ledger.invoice_terms_days);
  if (!isIsoDate(dueDate) || dueDate < i.issue_date) return bad('The due date must be on or after the invoice date.');

  let customerName: string;
  const newName = i.new_customer_name.trim();
  const newEmail = i.new_customer_email.trim().toLowerCase();
  if (i.customer_id > 0) {
    const { data: c } = await admin.from('books_customers').select('id, name, organisation').eq('id', i.customer_id).eq('ledger_id', ledger.id).maybeSingle();
    if (!c) return bad('There is no customer with that id. Look them up with the customers tool.');
    customerName = c.organisation || c.name;
  } else {
    if (!newName) return bad('Give a customer id, or a name for a new customer.');
    if (newEmail && !validEmail(newEmail)) return bad('That email address is not valid.');
    customerName = newName;
  }

  const accounts = await getAccounts(ledger.id);
  const income = new Set(accounts.filter((a) => a.type === 'income').map((a) => a.code));
  const registered = registeredOn({ vat_registered: ledger.vat_registered, vat_registration_date: ledger.vat_registration_date, vat_scheme: ledger.vat_scheme as 'standard' }, i.issue_date);
  const lines: InvoiceLine[] = [];
  for (const l of i.lines) {
    if (!income.has(l.income_code)) return bad(`${l.income_code} is not an income account in the chart.`);
    if (Math.round(l.quantity * 1000) !== l.quantity * 1000) return bad('Quantities can have up to three decimal places.');
    lines.push(priceLine({ description: l.description, quantity: l.quantity, unit_pence: pence(l.unit_price), vat_code: l.vat_code, account_code: l.income_code }, registered));
  }
  const totals = invoiceTotals(lines);
  if (totals.gross_pence <= 0) return bad('The invoice needs at least one line with an amount.');

  return {
    ok: true,
    value: {
      summary: {
        title: `Draft an invoice for ${customerName}${i.customer_id > 0 ? '' : ' (new customer)'}`,
        lines: [
          ...lines.map((l) => `${l.quantity.toLocaleString('en-GB')} × ${l.description} at ${formatPence(l.unit_pence)} = ${formatPence(l.net_pence)}`),
          totals.vat_pence > 0 ? `Total ${formatPence(totals.gross_pence)}, including ${formatPence(totals.vat_pence)} VAT` : `Total ${formatPence(totals.gross_pence)}`,
          `Dated ${ukDate(i.issue_date)}, due ${ukDate(dueDate)}`,
          'Saved as a draft: you check it and send it yourself.',
        ],
      },
      run: async () => {
        let customerId = i.customer_id;
        if (!(customerId > 0)) {
          // Someone of that name may be there already (a first try that saved the customer but not the invoice): use them.
          const { data: same } = await admin.from('books_customers').select('id').eq('ledger_id', ledger.id).ilike('name', newName.replace(/[%_\\]/g, '\\$&')).order('id').limit(1);
          if (same?.length) customerId = same[0].id;
          else {
            const { data: made, error } = await admin.from('books_customers').insert({ ledger_id: ledger.id, name: newName, email: newEmail || null }).select('id').single();
            if (error || !made) return bad('The customer couldn’t be saved. Please try again.');
            customerId = made.id;
          }
        }
        const made = await createDraftInvoice(ledger.id, { customerId, issueDate: i.issue_date, dueDate, notes: i.notes.trim() || null, lines });
        if (!made.ok) return made;
        return { ok: true, result: { message: `Draft invoice ${made.number} is ready to check and send.`, href: `/account/books/invoices/${made.id}` } };
      },
    },
  };
}

async function planPayment(ledger: Ledger, i: ActionInput<'record_invoice_payment'>): Promise<Checked<Plan>> {
  const admin = createServiceRoleClient();
  const { data: row } = await admin.from('books_invoices').select('id').eq('ledger_id', ledger.id).eq('number', i.invoice_number.trim()).maybeSingle();
  const inv = row ? await loadInvoice(ledger.id, row.id) : null;
  if (!inv) return bad(`There is no invoice numbered ${i.invoice_number}. Check the number with the invoices tool.`);
  if (inv.status !== 'issued') return bad(inv.status === 'draft' ? 'That invoice is still a draft: it has to be issued before a payment goes on it.' : 'That invoice is void.');
  const amount = pence(i.amount);
  const due = amountDue(inv);
  if (amount <= 0) return bad('The amount paid must be more than £0.');
  if (amount > due) return bad(`That’s more than is due on this invoice (${formatPence(due)}).`);
  if (!isIsoDate(i.paid_on) || i.paid_on > todayUk()) return bad('The payment date must be today or earlier.');
  const customer = inv.customer.organisation || inv.customer.name;
  return {
    ok: true,
    value: {
      summary: {
        title: `Record a payment on invoice ${inv.number}`,
        lines: [
          `${formatPence(amount)} from ${customer} on ${ukDate(i.paid_on)}`,
          `How: ${PAYMENT_METHODS[i.method].label}`,
          amount === due ? 'This pays the invoice in full.' : `${formatPence(due - amount)} will still be owed.`,
        ],
      },
      run: async () => {
        const res = await recordPayment(ledger, inv, { paid_on: i.paid_on, amount_pence: amount, method: i.method, reference: i.reference.trim() || null, external_id: null });
        if (!res.ok) return res;
        // The amount due has changed: an open card checkout for the old amount mustn't be paid.
        await expireInvoiceSession(inv, ledger);
        return { ok: true, result: { message: `Payment recorded on invoice ${inv.number}.`, href: `/account/books/invoices/${inv.id}` } };
      },
    },
  };
}

async function planRemove(ledger: Ledger, i: ActionInput<'remove_entry'>): Promise<Checked<Plan>> {
  const { data: e } = await createServiceRoleClient()
    .from('books_entries')
    .select('id, entry_date, source, counterparty, description, gross_pence')
    .eq('id', i.entry_id)
    .eq('ledger_id', ledger.id)
    .maybeSingle();
  if (!e) return bad(`There is no entry #${i.entry_id} in these books.`);
  if (!(VOIDABLE_SOURCES as readonly string[]).includes(e.source)) {
    return bad('That entry came from an invoice, an Emmerdale job or an import, so it can’t be removed here. An invoice is voided from its own page in Books.');
  }
  return {
    ok: true,
    value: {
      summary: {
        title: `Remove entry #${e.id}`,
        lines: [
          `${formatPence(e.gross_pence)}${e.counterparty ? ` · ${e.counterparty}` : ''} · ${ukDate(e.entry_date)}`,
          ...(e.description ? [e.description] : []),
          e.source === 'receipt' ? 'It comes out of your books and its receipt goes back to be reviewed.' : 'It comes out of your books. This can’t be undone, but you can record it again.',
        ],
      },
      run: async () => {
        if (!(await voidEntry(ledger.id, e.id))) return bad('That entry couldn’t be removed. It may already have gone.');
        return { ok: true, result: { message: `Entry #${e.id} removed.`, href: '/account/books/journal' } };
      },
    },
  };
}

async function planCategory(ledger: Ledger, i: ActionInput<'add_category'>): Promise<Checked<Plan>> {
  const accounts = await getAccounts(ledger.id);
  if (accounts.some((a) => a.code === i.code)) return bad(`There is already an account ${named(accounts, i.code)}. Pick a code that isn’t in the chart.`);
  return {
    ok: true,
    value: {
      summary: { title: 'Add a category', lines: [`${i.code} ${i.name}`, i.type === 'income' ? 'For money coming in' : 'For spending'] },
      run: async () => {
        const { error } = await createServiceRoleClient()
          .from('books_accounts')
          .insert({ ledger_id: ledger.id, code: i.code, name: i.name, type: i.type, description: null, is_fixed_asset: false });
        if (error) return bad(error.code === '23505' ? `There is already an account ${i.code}.` : 'The category didn’t save. Please try again.');
        return { ok: true, result: { message: `Added ${i.code} ${i.name}.`, href: '/account/books/accounts' } };
      },
    },
  };
}

/** Check a change against the books as they are now. Never writes. */
export async function planAction(kind: ActionKind, input: unknown, ledger: Ledger): Promise<Checked<Plan> & { input?: Json }> {
  const parsed = ACTION_INPUTS[kind].safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad(`Those details are not valid${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}. Dates are YYYY-MM-DD and amounts are in pounds.`);
  }
  const i = parsed.data as never;
  const plan = await (kind === 'record_expense'
    ? planDocument(ledger, 'purchase', i)
    : kind === 'record_income'
      ? planDocument(ledger, 'sale', i)
      : kind === 'record_mileage'
        ? planMileage(ledger, i)
        : kind === 'add_customer'
          ? planCustomer(ledger, i)
          : kind === 'draft_invoice'
            ? planInvoice(ledger, i)
            : kind === 'record_invoice_payment'
              ? planPayment(ledger, i)
              : kind === 'remove_entry'
                ? planRemove(ledger, i)
                : planCategory(ledger, i));
  return plan.ok ? { ...plan, input: parsed.data as unknown as Json } : plan;
}

/**
 * The model asked for a change: check it and hold it for the member to
 * confirm. Returns what to tell the model, and the action for the page when
 * one was made.
 */
export async function proposeAction(
  questionId: number,
  who: { contractorId: string; ledger: Ledger | null },
  name: string,
  input: unknown,
): Promise<{ toModel: unknown; action: AskActionView | null }> {
  if (!isActionKind(name)) return { toModel: { error: `There is no tool called ${name}.` }, action: null };
  if (!who.ledger) return { toModel: { error: NO_BOOKS }, action: null };
  const admin = createServiceRoleClient();
  const { count } = await admin.from('ask_actions').select('id', { count: 'exact', head: true }).eq('question_id', questionId);
  if ((count ?? 0) >= MAX_ACTIONS_PER_QUESTION) {
    return { toModel: { error: `Only ${MAX_ACTIONS_PER_QUESTION} changes can be prepared in one answer. Tell the person to confirm these and then ask for the rest.` }, action: null };
  }
  const plan = await planAction(name, input, who.ledger);
  if (!plan.ok) return { toModel: { prepared: false, error: plan.error }, action: null };
  const { data: row, error } = await admin
    .from('ask_actions')
    .insert({ question_id: questionId, contractor_id: who.contractorId, kind: name, input: plan.input as Json, summary: plan.value.summary as unknown as Json })
    .select('id, kind, summary, status, result, error')
    .single();
  if (error || !row) {
    console.error('[ask] action not saved', { questionId, kind: name, error: error?.message });
    return { toModel: { prepared: false, error: 'The change could not be prepared just now.' }, action: null };
  }
  return {
    toModel: {
      prepared: true,
      recorded: false,
      shown_to_person: plan.value.summary,
      note: 'The person now sees this with a Confirm button. It is not in the books until they confirm. Do not say it has been done.',
    },
    action: actionView(row),
  };
}

/**
 * The model took back a change it prepared earlier that the member hasn't
 * confirmed. Returns what to tell the model and the id withdrawn, if any.
 */
export async function withdrawAction(contractorId: string, input: unknown): Promise<{ toModel: unknown; withdrawn: number | null }> {
  const id = Number((input as { change?: unknown } | null)?.change);
  if (!Number.isSafeInteger(id) || id <= 0) return { toModel: { withdrawn: false, error: 'Give the number of the change.' }, withdrawn: null };
  const action = await cancelAction(id, contractorId);
  if (!action) return { toModel: { withdrawn: false, error: `There is no change ${id}.` }, withdrawn: null };
  if (action.status !== 'cancelled') {
    return { toModel: { withdrawn: false, error: action.status === 'done' ? 'That change was already confirmed and done, so it cannot be withdrawn.' : 'That change is being recorded now.' }, withdrawn: null };
  }
  return { toModel: { withdrawn: true }, withdrawn: id };
}

/** An action claimed this long ago and never finished: its request died. It is not retried (it may have been recorded). */
const STUCK_MS = 2 * 60 * 1000;

/**
 * The member confirmed: check the change again against the books as they are
 * now and do it. Claimed first, so two taps can't record it twice. A change
 * that no longer checks out stays pending with the reason.
 */
export async function confirmAction(actionId: number, contractorId: string, ledger: Ledger): Promise<AskActionView | null> {
  const admin = createServiceRoleClient();
  const cols = 'id, kind, input, summary, status, result, error';
  const { data: claimed } = await admin
    .from('ask_actions')
    .update({ status: 'running', error: null, finished_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('contractor_id', contractorId)
    .eq('status', 'pending')
    .select(cols);
  const row = claimed?.[0];
  if (!row) {
    // Already done, cancelled or being done: show it as it stands.
    const { data } = await admin.from('ask_actions').select(cols).eq('id', actionId).eq('contractor_id', contractorId).maybeSingle();
    return data ? actionView(data) : null;
  }
  const back = async (error: string) => {
    const { data } = await admin.from('ask_actions').update({ status: 'pending', error, finished_at: null }).eq('id', actionId).eq('status', 'running').select(cols).single();
    return data ? actionView(data) : actionView({ ...row, status: 'pending', error });
  };
  if (!isActionKind(row.kind)) return back('This change is no longer supported.');
  let outcome: Awaited<ReturnType<Plan['run']>>;
  try {
    const plan = await planAction(row.kind, row.input, ledger);
    if (!plan.ok) return back(plan.error);
    outcome = await plan.value.run();
  } catch (err) {
    // It may or may not have been written: leave it claimed rather than risk recording it twice.
    console.error('[ask] action crashed', { actionId, kind: row.kind, error: err instanceof Error ? err.message : err });
    return actionView({ ...row, status: 'running' });
  }
  if (!outcome.ok) return back(outcome.error);
  const { data: done, error } = await admin
    .from('ask_actions')
    .update({ status: 'done', result: outcome.result as unknown as Json, finished_at: new Date().toISOString() })
    .eq('id', actionId)
    .select(cols)
    .single();
  if (error) console.error('[ask] action done but not marked', { actionId, error: error.message });
  return done ? actionView(done) : actionView({ ...row, status: 'done', result: outcome.result });
}

/** The member said no: the change is dropped. */
export async function cancelAction(actionId: number, contractorId: string): Promise<AskActionView | null> {
  const admin = createServiceRoleClient();
  await admin
    .from('ask_actions')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('contractor_id', contractorId)
    .eq('status', 'pending');
  const { data } = await admin.from('ask_actions').select('id, kind, summary, status, result, error').eq('id', actionId).eq('contractor_id', contractorId).maybeSingle();
  return data ? actionView(data) : null;
}

/** The prepared changes of some questions, by question id, oldest first. `stuck` marks ones whose confirm never finished. */
export async function actionsFor(contractorId: string, questionIds: number[]): Promise<Map<number, AskActionView[]>> {
  const out = new Map<number, AskActionView[]>();
  if (!questionIds.length) return out;
  const { data, error } = await createServiceRoleClient()
    .from('ask_actions')
    .select('id, question_id, kind, summary, status, result, error, finished_at')
    .eq('contractor_id', contractorId)
    .in('question_id', questionIds)
    .order('id');
  if (error) {
    console.error('[ask] actions read failed', error.message);
    return out;
  }
  for (const r of data ?? []) {
    const stuck = r.status === 'running' && Boolean(r.finished_at) && Date.now() - Date.parse(r.finished_at as string) > STUCK_MS;
    out.set(r.question_id, [...(out.get(r.question_id) ?? []), { ...actionView(r), stuck }]);
  }
  return out;
}
