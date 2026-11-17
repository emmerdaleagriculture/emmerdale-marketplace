'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';
import { DETAILS_MAX, TITLE_MAX, isDay, isTime } from './diary';

/**
 * The Diary's writes. They run as the signed-in user, so RLS on
 * diary_entries (owner only) is what keeps one diary out of another; the
 * user_id we set on insert has to match auth.uid() or the insert is refused.
 */

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function readEntry(formData: FormData): { error: string } | {
  entry_date: string;
  start_time: string | null;
  title: string;
  details: string | null;
} {
  const entry_date = String(formData.get('entry_date') ?? '');
  const time = String(formData.get('start_time') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();
  if (!isDay(entry_date)) return { error: 'Pick a day.' };
  if (time && !isTime(time)) return { error: 'That time doesn’t look right.' };
  if (!title) return { error: 'Write something first.' };
  if (title.length > TITLE_MAX) return { error: `Keep the first line under ${TITLE_MAX} characters; the rest can go in the details.` };
  if (details.length > DETAILS_MAX) return { error: `Details are limited to ${DETAILS_MAX} characters.` };
  return { entry_date, start_time: time || null, title, details: details || null };
}

export async function saveDiaryEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: 'Sign in to use your diary.' };

  const entry = readEntry(formData);
  if ('error' in entry) return { error: entry.error };

  const id = String(formData.get('id') ?? '');
  const { error } = id
    ? await supabase.from('diary_entries').update(entry).eq('id', id).eq('user_id', user.id)
    : await supabase.from('diary_entries').insert({ ...entry, user_id: user.id });
  if (error) {
    console.error('[diary] save failed:', error);
    return { error: 'That didn’t save. Please try again.' };
  }
  revalidatePath('/app/diary');
  return { ok: true, message: id ? 'Saved.' : 'Added.' };
}

export async function setDiaryEntryDoneAction(id: string, done: boolean): Promise<FormState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: 'Sign in to use your diary.' };
  const { error } = await supabase.from('diary_entries').update({ done }).eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[diary] done toggle failed:', error);
    return { error: 'That didn’t save. Please try again.' };
  }
  revalidatePath('/app/diary');
  return { ok: true };
}

export async function deleteDiaryEntryAction(id: string): Promise<FormState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: 'Sign in to use your diary.' };
  const { error } = await supabase.from('diary_entries').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[diary] delete failed:', error);
    return { error: 'That didn’t delete. Please try again.' };
  }
  revalidatePath('/app/diary');
  return { ok: true };
}
