'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { siteUrl } from '@/lib/site';
import {
  CODE_MINUTES,
  MAX_ATTEMPTS,
  RESEND_SECONDS,
  HOLD_HOURS,
  codeMatches,
  hashCode,
  holdUntil,
  last4,
  makeCode,
  maskEmail,
  normaliseAccountName,
  normaliseAccountNumber,
  normaliseSortCode,
} from '@/lib/bankDetails';

export type BankState = { error?: string; step?: 'code' | 'done'; sentTo?: string; last4?: string; held?: boolean };

/** The signed-in contractor and the address their codes go to. */
async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: c } = await createServiceRoleClient().from('contractors').select('id, email, business_name').eq('id', user.id).maybeSingle();
  if (!c) return null;
  const email = (user.email || c.email || '').trim();
  return { id: c.id, email, business: c.business_name };
}

async function send(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const { error } = await new Resend(key).emails.send({ from, to: [to], subject, text, tags: [{ name: 'kind', value: 'bank_details' }] });
    if (error) console.error('[bank] email failed', error.message);
    return !error;
  } catch (err) {
    console.error('[bank] email failed', err);
    return false;
  }
}

/**
 * Step 1: check the new details and email a code to the contractor. The
 * details wait with the code's hash (service role only) until it is entered.
 */
export async function requestBankCodeAction(_prev: BankState, form: FormData): Promise<BankState> {
  const who = await me();
  if (!who) return { error: 'Please sign in again.' };
  if (!who.email) return { error: 'Your account has no email address for the code. Please contact us to change your bank details.' };

  const name = normaliseAccountName(String(form.get('account_name') ?? ''));
  const sort = normaliseSortCode(String(form.get('sort_code') ?? ''));
  const acct = normaliseAccountNumber(String(form.get('account_number') ?? ''));
  if (!name) return { error: 'Enter the name on the account.' };
  if (!sort) return { error: 'The sort code is six digits, like 12-34-56.' };
  if (!acct) return { error: 'The account number is eight digits.' };

  const admin = createServiceRoleClient();
  const { data: pending } = await admin.from('bank_detail_codes').select('created_at').eq('contractor_id', who.id).maybeSingle();
  if (pending && Date.now() - new Date(pending.created_at).getTime() < RESEND_SECONDS * 1000) {
    return { error: 'We’ve just sent a code. Please wait a minute before asking for another.' };
  }

  const code = makeCode();
  const { error } = await admin.from('bank_detail_codes').upsert({
    contractor_id: who.id,
    code_hash: hashCode(who.id, code),
    account_name: name,
    sort_code: sort,
    account_number: acct,
    attempts: 0,
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[bank] code save failed', { contractor: who.id, error: error.message });
    return { error: 'Something went wrong. Please try again.' };
  }

  const sent = await send(
    who.email,
    `${code} is your code to change your bank details`,
    [
      `Your code is ${code}`,
      '',
      `Enter it in Emmerdale to change the bank account we pay you into, to one ending ${last4(acct)}. It works for ${CODE_MINUTES} minutes.`,
      '',
      'If you didn’t ask to change your bank details, don’t enter the code and reply to this email straight away: someone may have your sign-in.',
    ].join('\n'),
  );
  if (!sent) {
    await admin.from('bank_detail_codes').delete().eq('contractor_id', who.id);
    return { error: 'We couldn’t send the code. Please try again.' };
  }
  return { step: 'code', sentTo: maskEmail(who.email) };
}

/**
 * Step 2: the code. Right: the details change, payouts to them wait
 * HOLD_HOURS, the change is logged, the contractor and the admins are told.
 */
export async function confirmBankCodeAction(_prev: BankState, form: FormData): Promise<BankState> {
  const who = await me();
  if (!who) return { error: 'Please sign in again.' };
  const code = String(form.get('code') ?? '').replace(/\s/g, '');
  const admin = createServiceRoleClient();
  const { data: p } = await admin.from('bank_detail_codes').select('*').eq('contractor_id', who.id).maybeSingle();
  if (!p) return { error: 'That code has expired. Please start again.' };
  if (new Date(p.expires_at).getTime() < Date.now() || p.attempts >= MAX_ATTEMPTS) {
    await admin.from('bank_detail_codes').delete().eq('contractor_id', who.id);
    return { error: 'That code has expired. Please start again.' };
  }
  if (!/^\d{6}$/.test(code) || !codeMatches(who.id, code, p.code_hash)) {
    const attempts = p.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from('bank_detail_codes').delete().eq('contractor_id', who.id);
      return { error: 'Too many wrong codes. Please start again.' };
    }
    await admin.from('bank_detail_codes').update({ attempts }).eq('contractor_id', who.id);
    return { step: 'code', error: `That code isn’t right. ${MAX_ATTEMPTS - attempts} ${MAX_ATTEMPTS - attempts === 1 ? 'try' : 'tries'} left.` };
  }

  const { data: old } = await admin.from('contractor_bank_details').select('account_number, changed_count').eq('contractor_id', who.id).maybeSingle();
  // The first details on file have nothing to be swapped from: no hold.
  const hold = old ? holdUntil().toISOString() : null;
  const now = new Date().toISOString();
  const { error } = await admin.from('contractor_bank_details').upsert({
    contractor_id: who.id,
    account_name: p.account_name,
    sort_code: p.sort_code,
    account_number: p.account_number,
    hold_until: hold,
    changed_count: (old?.changed_count ?? 0) + (old ? 1 : 0),
    updated_at: now,
  });
  if (error) {
    console.error('[bank] save failed', { contractor: who.id, error: error.message });
    return { step: 'code', error: 'Something went wrong. Please try again.' };
  }
  await admin.from('bank_detail_codes').delete().eq('contractor_id', who.id);

  const h = await headers();
  await admin.from('bank_detail_changes').insert({
    contractor_id: who.id,
    old_last4: old ? last4(old.account_number) : null,
    new_last4: last4(p.account_number),
    hold_until: hold,
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
  });

  const was = old ? ` from the account ending ${last4(old.account_number)}` : '';
  await send(
    who.email,
    'Your bank details have been changed',
    [
      `The bank account we pay you into has been changed${was} to one ending ${last4(p.account_number)}.`,
      '',
      old ? `To keep you safe, payouts to the new account start after ${HOLD_HOURS} hours.` : '',
      '',
      'If this wasn’t you, reply to this email straight away and we’ll stop any payment.',
      '',
      `${siteUrl()}/account/bank`,
    ]
      .filter((l, i, a) => l !== '' || a[i - 1] !== '')
      .join('\n'),
  );
  await notifyAdmins(
    `Bank details ${old ? 'changed' : 'added'}: ${who.business}`,
    `${who.business} ${old ? `changed their bank details${was} to an account ending ${last4(p.account_number)}. Payouts are held until ${new Date(hold!).toLocaleString('en-GB', { timeZone: 'Europe/London' })}.` : `added bank details (account ending ${last4(p.account_number)}).`}\n\nIf anything looks wrong, call them on the number you already have before paying.`,
  );

  revalidatePath('/account/bank');
  revalidatePath('/app/earnings');
  return { step: 'done', last4: last4(p.account_number), held: !!hold };
}

/** Back out of a change before the code is entered. */
export async function cancelBankChangeAction(): Promise<BankState> {
  const who = await me();
  if (who) await createServiceRoleClient().from('bank_detail_codes').delete().eq('contractor_id', who.id);
  return {};
}
