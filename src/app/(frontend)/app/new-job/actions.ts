'use server';

import { getUser } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { forgetJustSentJob } from '@/lib/jobCookie';
import { claimJobForUser } from '@/lib/customers/claim';

/**
 * The last step of the app's job flow: the job /start's confirm action has
 * just created is attached to the signed-in customer's account, and its
 * client token handed back so the app can open the job page. Looked up by
 * the submission id the parse step returned, and only if the job carries
 * this person's own email — the same claim the website's thank-you page
 * makes, without the extra button.
 */
export async function claimJustSentJobAction(submissionId: string): Promise<{ token: string | null }> {
  const user = await getUser();
  if (!user?.email || !/^[0-9a-f-]{36}$/i.test(submissionId)) return { token: null };
  const { data: js } = await createServiceRoleClient()
    .from('job_submissions')
    .select('client_token, contact_email')
    .eq('id', submissionId)
    .maybeSingle();
  if (!js?.client_token || (js.contact_email ?? '').toLowerCase() !== user.email.toLowerCase()) {
    return { token: null };
  }
  const claim = await claimJobForUser(user.id, user.email, js.client_token);
  if (!claim.ok) console.error('[app/new-job] auto-claim failed:', claim.reason);
  await forgetJustSentJob();
  return { token: js.client_token };
}
