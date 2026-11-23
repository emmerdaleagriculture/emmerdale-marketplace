'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireBooksWriter, type Ledger } from '@/lib/books/server';
import { parsePounds } from '@/lib/books/money';
import { isIsoDate, todayUk } from '@/lib/books/period';
import {
  checkBoth,
  filingAvailable,
  filingYears,
  listFilings,
  pollFilings,
  resetFigures,
  saveFigures,
  submitFiling,
  yearEndView,
  type FilingKind,
} from '@/lib/books/filing.server';
import { LABELS, PENCE_FIELDS, problems, SIGNED_FIELDS, type YearEndFigures } from '@/lib/books/yearEnd';
import type { FormState } from '@/lib/form';

const PATH = '/account/books/year-end';

async function gate(fd: FormData): Promise<{ error: string } | { ledger: Ledger; userId: string; period: { from: string; to: string } }> {
  const g = await requireBooksWriter();
  if (!g.ok) return { error: g.error };
  if (!g.ledger) return { error: 'Set up your books first.' };
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!(await filingAvailable(g.ledger, user?.email))) return { error: 'Year-end filing isn’t available on your account.' };
  const end = String(fd.get('period_end') ?? '');
  const year = isIsoDate(end) ? (await filingYears(g.ledger)).find((y) => y.to === end) : undefined;
  if (!year) return { error: 'Choose a year. Please refresh and try again.' };
  if (year.beforeBooks) return { error: 'That year was summed up in your opening balances, so it can’t be filed from here.' };
  return { ledger: g.ledger, userId: g.userId, period: { from: year.from, to: year.to } };
}

function figuresFrom(fd: FormData): { figures: YearEndFigures } | { error: string } {
  const f = {} as YearEndFigures;
  for (const k of PENCE_FIELDS) {
    const raw = String(fd.get(k) ?? '').trim();
    const p = raw === '' ? 0 : parsePounds(raw);
    if (p === null) return { error: `${LABELS[k]}: enter an amount in pounds, like 12,345.67.` };
    if (p < 0 && !SIGNED_FIELDS.includes(k)) return { error: `${LABELS[k]} can’t be negative.` };
    f[k] = p;
  }
  const int = (k: string) => {
    const v = Number(String(fd.get(k) ?? '0').trim() || '0');
    return Number.isInteger(v) && v >= 0 ? v : NaN;
  };
  f.averageEmployees = int('averageEmployees');
  f.associatedCompanies = int('associatedCompanies');
  if (Number.isNaN(f.averageEmployees)) return { error: 'Average employees should be a whole number.' };
  if (Number.isNaN(f.associatedCompanies)) return { error: 'Associated companies should be a whole number.' };
  f.declarantName = String(fd.get('declarantName') ?? '').trim().slice(0, 120);
  f.firstYear = fd.get('firstYear') === 'on';
  if (fd.get('has_loan') === 'on') {
    const p = (k: string) => {
      const raw = String(fd.get(k) ?? '').trim();
      return raw === '' ? 0 : parsePounds(raw);
    };
    const vals = { broughtForward: p('dl_bf'), lent: p('dl_lent'), repaidInYear: p('dl_repaid_in'), repaidAfter: p('dl_repaid_after') };
    if (Object.values(vals).some((v) => v === null || v < 0)) return { error: 'Director’s loan amounts should be pounds, 0 or more.' };
    const date = String(fd.get('dl_repaid_date') ?? '').trim();
    f.directorLoan = {
      name: String(fd.get('dl_name') ?? '').trim().slice(0, 56),
      broughtForward: vals.broughtForward!,
      lent: vals.lent!,
      repaidInYear: vals.repaidInYear!,
      repaidAfter: vals.repaidAfter!,
      repaidDate: isIsoDate(date) ? date : null,
    };
  } else {
    f.directorLoan = null;
  }
  return { figures: f };
}

/** Save the figures and run TinyTax's dry runs of both filings. */
export async function checkFiguresAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await gate(fd);
  if ('error' in g) return { error: g.error };
  const parsed = figuresFrom(fd);
  if ('error' in parsed) return { error: parsed.error };
  const { figures } = parsed;
  const view = await yearEndView(g.ledger, g.period, '');
  const blockers = problems(figures, { periodEnd: g.period.to, today: todayUk(), dlaOverdrawn: view.dlaOverdrawn });
  // Keep what they typed either way, so a fix doesn't mean typing it all again.
  await saveFigures(g.ledger.id, g.period, figures, null);
  if (blockers.length) {
    revalidatePath(PATH);
    return { error: blockers.join(' ') };
  }
  if (g.period.to >= todayUk()) {
    revalidatePath(PATH);
    return { ok: true, message: 'Saved. TinyTax can check them once the year has ended.' };
  }
  const check = await checkBoth(g.ledger, g.period, figures);
  if ('error' in check) {
    revalidatePath(PATH);
    return { error: check.error };
  }
  await saveFigures(g.ledger.id, g.period, figures, check);
  revalidatePath(PATH);
  const passed = check.ct600.ok && check.accounts.ok;
  return passed ? { ok: true, message: 'Checked. TinyTax’s results are below.' } : { error: 'TinyTax found problems. See below.' };
}

/** Throw away edits: back to the figures in the books. */
export async function resetFiguresAction(fd: FormData): Promise<void> {
  const g = await gate(fd);
  if ('error' in g) return;
  await resetFigures(g.ledger.id, g.period.to);
  revalidatePath(PATH);
}

/** File the accounts or the CT600 for real. */
export async function fileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await gate(fd);
  if ('error' in g) return { error: g.error };
  const kind = String(fd.get('kind') ?? '') as FilingKind;
  if (kind !== 'ct600' && kind !== 'accounts') return { error: 'Something went wrong. Please refresh and try again.' };
  if (fd.get('approve') !== 'on') return { error: 'Tick to confirm you approve these figures as a director.' };
  if (fd.get('nil') !== 'on') return { error: 'Tick to confirm the statements about the notes, or don’t file here.' };
  const r = await submitFiling(g.ledger, g.period, kind, g.userId);
  revalidatePath(PATH);
  if (!r.ok) return { error: r.error };
  const what = kind === 'ct600' ? 'CT600' : 'accounts';
  return {
    ok: true,
    message: r.filing.sandbox
      ? `Sent to TinyTax’s sandbox (test key): nothing has gone to ${kind === 'ct600' ? 'HMRC' : 'Companies House'}.`
      : `Your ${what} ${r.filing.status === 'accepted' ? 'have been accepted' : 'are on their way'}. This page updates as ${kind === 'ct600' ? 'HMRC' : 'Companies House'} answers, usually within 5 minutes.`,
  };
}

/** Ask TinyTax now about filings still on their way. */
export async function refreshFilingsAction(fd: FormData): Promise<void> {
  const g = await requireBooksWriter();
  if (!g.ok || !g.ledger) return;
  void fd;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!(await filingAvailable(g.ledger, user?.email))) return;
  await pollFilings(g.ledger, await listFilings(g.ledger.id), { force: true });
  revalidatePath(PATH);
}
