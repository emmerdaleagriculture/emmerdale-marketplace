import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Before-and-after photos of the work (job_work_photos, PRD task 9), taken
 * by the contractor in the app and shown to the customer at sign-off. Paths
 * live in the private job-photos bucket under <submission>/work/.
 */
export type WorkPhoto = { id: string; phase: 'before' | 'after'; url: string; createdAt: string };

export async function getWorkPhotos(submissionId: string): Promise<WorkPhoto[]> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('job_work_photos')
    .select('id, phase, path, created_at')
    .eq('submission_id', submissionId)
    .order('created_at');
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: signed } = await admin.storage.from('job-photos').createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.flatMap((r) => {
    const url = urls.get(r.path);
    return url ? [{ id: r.id, phase: r.phase as 'before' | 'after', url, createdAt: r.created_at }] : [];
  });
}
