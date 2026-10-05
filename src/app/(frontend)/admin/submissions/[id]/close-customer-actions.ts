'use server';

import { revalidatePath } from 'next/cache';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { closeCustomer } from '@/lib/closeCustomer';
import type { FormState } from '@/lib/form';

/**
 * Admin closes a customer from one of their jobs: a customer who emails
 * "take my jobs off and close my account" is one click, not SQL.
 */
export async function closeCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return { error: 'Not allowed.' };
  const id = String(formData.get('submission_id') ?? '');
  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'close') return { error: 'Type "close" to confirm.' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin.from('job_submissions').select('contact_email').eq('id', id).maybeSingle();
  if (!js?.contact_email) return { error: 'No customer email on this job.' };
  if (js.contact_email.endsWith('@emmerdaleagriculture.invalid')) return { error: 'This customer is already closed.' };

  const res = await closeCustomer(js.contact_email);
  if ('error' in res) return res;
  revalidatePath(`/admin/submissions/${id}`);
  return { ok: true, message: `Closed: ${res.jobs} job(s) scrubbed, ${res.withdrawn} withdrawn, login removed.` };
}
