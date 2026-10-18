'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/form';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 8 * 1024 * 1024;
const ON_THE_JOB = ['awarded', 'contacted', 'scheduled', 'in_progress', 'completed_by_contractor'];

/** One photo of the work, before or after. Only the job's own contractor, only while it is theirs to do. */
export async function uploadWorkPhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in again to add photos.' };
  const submissionId = String(formData.get('submission_id') || '');
  const phase = String(formData.get('phase') || '');
  const file = formData.get('photo');
  if (!submissionId || (phase !== 'before' && phase !== 'after')) return { error: 'Something went wrong — try again.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo.' };
  if (file.size > MAX) return { error: 'That photo is too large.' };
  const ext = TYPES[file.type];
  if (!ext) return { error: 'Photos only (JPEG, PNG or WebP).' };

  const admin = createServiceRoleClient();
  const { data: js } = await admin
    .from('job_submissions')
    .select('status, awarded_contractor_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (!js || js.awarded_contractor_id !== user.id) return { error: 'This job isn’t yours.' };
  if (!ON_THE_JOB.includes(js.status)) return { error: 'This job is no longer open for photos.' };

  // After photos only once there is a before: the point is the comparison.
  if (phase === 'after') {
    const { count } = await admin.from('job_work_photos').select('id', { count: 'exact', head: true }).eq('submission_id', submissionId).eq('phase', 'before');
    if (!count) return { error: 'Add a before photo first.' };
  }

  const path = `${submissionId}/work/${phase}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from('job-photos')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (upErr) {
    console.error('[work-photos] upload failed:', upErr.message);
    return { error: 'The upload didn’t go through — try again.' };
  }
  const { error } = await admin.from('job_work_photos').insert({ submission_id: submissionId, contractor_id: user.id, phase, path });
  if (error) {
    console.error('[work-photos] insert failed:', error.message);
    return { error: 'The photo didn’t save — try again.' };
  }
  revalidatePath(`/won/${submissionId}/photos`);
  return { ok: true };
}

export async function removeWorkPhotoAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const id = String(formData.get('id') || '');
  if (!user || !id) return;
  const admin = createServiceRoleClient();
  const { data: row } = await admin.from('job_work_photos').select('submission_id, path').eq('id', id).eq('contractor_id', user.id).maybeSingle();
  if (!row) return;
  await admin.storage.from('job-photos').remove([row.path]);
  await admin.from('job_work_photos').delete().eq('id', id);
  revalidatePath(`/won/${row.submission_id}/photos`);
}
