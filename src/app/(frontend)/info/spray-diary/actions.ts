'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { readSprayRecord } from '@/lib/info/sprayRecords';

/**
 * The spray diary's writes. They run as the signed-in user, so RLS on
 * spray_records (owner only) keeps one diary out of another. A record is
 * added or removed, never edited: it is a record of what was done.
 */

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function saveSprayRecordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: 'Sign in to keep a spray diary.' };
  const row = readSprayRecord(formData, today());
  if ('error' in row) return { error: row.error };
  const { error } = await supabase.from('spray_records').insert({ ...row, user_id: user.id });
  if (error) {
    console.error('[spray-diary] save failed:', error);
    return { error: 'That didn’t save. Please try again.' };
  }
  revalidatePath('/info/spray-diary');
  return { ok: true, message: 'Saved to your spray diary.' };
}

export async function deleteSprayRecordAction(id: string): Promise<FormState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: 'Sign in to keep a spray diary.' };
  const { error } = await supabase.from('spray_records').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[spray-diary] delete failed:', error);
    return { error: 'That didn’t delete. Please try again.' };
  }
  revalidatePath('/info/spray-diary');
  return { ok: true };
}
