'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import type { FormState } from '@/lib/form';

/**
 * Clearing drafts off the submissions board.
 *
 * Hidden rather than deleted: every draft carries a job_submission_parses
 * row and that column is NOT NULL, so a real delete would take the parse
 * with it — and the parse log is the eval corpus for the /start parser.
 * admin_hide_drafts refuses anything that is not a draft, so a stray id
 * cannot take a live job off the board.
 */

async function assertAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user;
}

function refresh() {
  revalidatePath('/admin/submissions');
  revalidatePath('/admin/metrics');
}

function ids(formData: FormData): string[] {
  return formData.getAll('ids').map(String).filter(Boolean);
}

export async function hideDraftsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertAdmin();
  const chosen = ids(formData);
  if (chosen.length === 0) return { error: 'Tick the drafts you want gone first.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('admin_hide_drafts', {
    p_ids: chosen,
    p_actor: user.id,
  });
  if (error) {
    console.error('[admin] admin_hide_drafts failed:', error);
    return { error: 'Could not clear those — try again.' };
  }

  const { hidden, refused } = data as { hidden: number; refused: number };
  refresh();
  return {
    ok: true,
    message:
      `${hidden} draft${hidden === 1 ? '' : 's'} cleared.` +
      // Only happens if a live job's id was posted, which the UI never does.
      (refused > 0 ? ` ${refused} left alone — not drafts.` : ''),
  };
}

export async function restoreDraftsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const chosen = ids(formData);
  if (chosen.length === 0) return { error: 'Tick the drafts you want back first.' };

  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('admin_unhide_drafts', { p_ids: chosen });
  if (error) {
    console.error('[admin] admin_unhide_drafts failed:', error);
    return { error: 'Could not put those back — try again.' };
  }
  const { restored } = data as { restored: number };
  refresh();
  return { ok: true, message: `${restored} draft${restored === 1 ? '' : 's'} back on the board.` };
}
