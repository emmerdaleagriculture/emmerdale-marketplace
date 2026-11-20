'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser, isAdminEmail } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSentryIssue } from '@/lib/sentry/issues';
import { runHeartbeat } from '@/lib/heartbeat/run';

async function admin(): Promise<string> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return user.email ?? 'admin';
}

function back(msg: string): never {
  revalidatePath('/admin/errors');
  redirect(`/admin/errors?msg=${encodeURIComponent(msg)}`);
}

export async function runHeartbeatAction(): Promise<void> {
  await admin();
  const r = await runHeartbeat();
  back(r.failing.length ? `Heartbeat ran: ${r.failing.length} of ${r.checks} checks failing.` : `Heartbeat ran: all ${r.checks} checks ok.`);
}

export async function resolveSentryAction(formData: FormData): Promise<void> {
  await admin();
  const r = await resolveSentryIssue(String(formData.get('id') ?? ''));
  back(r.ok ? 'Resolved in Sentry. It reopens by itself if it happens again.' : r.error);
}

/** Hide a row from our own tables until it happens again. */
export async function ackErrorAction(formData: FormData): Promise<void> {
  const by = await admin();
  const section = String(formData.get('section') ?? '');
  const key = String(formData.get('key') ?? '').slice(0, 500);
  if (!['refusal', 'email', 'payment'].includes(section) || !key) back('Nothing to clear.');
  const { error } = await createServiceRoleClient()
    .from('admin_error_acks')
    .upsert({ section, key, acked_at: new Date().toISOString(), acked_by: by }, { onConflict: 'section,key' });
  back(error ? `Could not clear: ${error.message}` : 'Cleared. It comes back if it happens again.');
}
