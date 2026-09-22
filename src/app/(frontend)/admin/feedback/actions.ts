'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getUser, isAdminEmail } from '@/lib/auth';

/** Mark a piece of feedback dealt with, or put it back in the list. */
export async function setFeedbackHandledAction(formData: FormData) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  const id = String(formData.get('id') ?? '');
  const handled = formData.get('handled') === 'yes';
  if (!id) return;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('feedback')
    .update(
      handled
        ? { handled_at: new Date().toISOString(), handled_by: user.id }
        : { handled_at: null, handled_by: null },
    )
    .eq('id', id);
  if (error) console.error('[feedback] handled toggle failed:', error);
  revalidatePath('/admin/feedback');
}
