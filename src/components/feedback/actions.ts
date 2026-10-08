'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { redactPath } from '@/lib/analyticsPaths';
import { parseJobPath } from '@/lib/feedback/jobPath';
import type { FormState } from '@/lib/form';

const SUCCESS = 'Thanks — that has gone straight to us, and we will look at it today.';

const FeedbackSchema = z.object({
  message: z.string().trim().min(3, 'Tell us a little more than that.').max(4000),
  // Only shown to people we cannot already identify.
  email: z.string().trim().email('That email does not look right.').optional().or(z.literal('')),
  path: z.string().trim().max(512).optional().or(z.literal('')),
});

/**
 * A problem report, or any other feedback, from anywhere on the site.
 *
 * Who they are is resolved HERE, from the session, rather than sent by the
 * page: a hidden role field is a field anyone can edit, and the whole value
 * of knowing whether a complaint came from a contractor or a customer is
 * that it is true.
 *
 * On the job pages nobody is signed in: the token in the path is who they
 * are. It is resolved the same way the page itself resolves it, and what it
 * gives — the job, the thread, the person's name and address — is kept, so
 * a report from a thread lands with a link to that thread. The path is still
 * redacted before it is stored: the token is a key, and the reason to keep
 * the page at all is to know which screen went wrong.
 */
type JobContext = {
  submissionId: string | null;
  invitationId: string | null;
  contactName: string | null;
  email: string | null;
  role: 'customer' | 'contractor';
};

async function resolveJobContext(path: string): Promise<JobContext | null> {
  const job = parseJobPath(path);
  if (!job) return null;
  const admin = createServiceRoleClient();
  if (job.side === 'customer') {
    const { data } = await admin
      .from('job_submissions')
      .select('id, contact_name, contact_email')
      .eq('client_token', job.token)
      .maybeSingle();
    if (!data) return null;
    return {
      submissionId: data.id,
      invitationId: null,
      contactName: data.contact_name ?? null,
      email: data.contact_email ?? null,
      role: 'customer',
    };
  }
  const { data } = await admin
    .from('job_invitations')
    .select('id, submission_id, contractor:contractors (business_name, email)')
    .eq('token', job.token)
    .maybeSingle();
  if (!data) return null;
  const c = data.contractor as { business_name: string | null; email: string | null } | null;
  return {
    submissionId: data.submission_id,
    invitationId: data.id,
    contactName: c?.business_name ?? null,
    email: c?.email ?? null,
    role: 'contractor',
  };
}

export async function submitFeedbackAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Same invisible traps as the enquiry form: a filled honeypot or a form
  // returned within three seconds is a bot. Answer as if it worked.
  if (String(formData.get('website') || '')) return { ok: true, message: SUCCESS };
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (renderedAt > 0 && Date.now() - renderedAt < 3000) return { ok: true, message: SUCCESS };

  const parsed = FeedbackSchema.safeParse({
    message: formData.get('message'),
    email: formData.get('email') ?? '',
    path: formData.get('path') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  // Session first: it gives us the email and the side they are on for free.
  let userId: string | null = null;
  let email = d.email || null;
  let role = 'visitor';
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      email = user.email ?? email;
      const admin = createServiceRoleClient();
      const [contractor, customer] = await Promise.all([
        admin.from('contractors').select('id').eq('id', user.id).maybeSingle(),
        admin.from('customers').select('id').eq('id', user.id).maybeSingle(),
      ]);
      role = contractor.data && customer.data
        ? 'both'
        : contractor.data
          ? 'contractor'
          : customer.data
            ? 'customer'
            : 'account';
    }
  } catch (err) {
    // Never cost someone their message because we could not work out who
    // they were. It lands as a visitor.
    console.error('[feedback] viewer lookup failed:', err);
  }

  // The job page's token says who they are when the session does not. A
  // typed email still wins: it is where they asked for the reply to go.
  let job: JobContext | null = null;
  try {
    job = d.path ? await resolveJobContext(d.path) : null;
  } catch (err) {
    console.error('[feedback] job lookup failed:', err);
  }
  if (job) {
    if (!userId) role = job.role;
    email = email ?? job.email;
  }

  const path = d.path ? redactPath(d.path).slice(0, 512) : null;
  const userAgent = (await headers()).get('user-agent')?.slice(0, 400) ?? null;

  const admin = createServiceRoleClient();
  const { error } = await admin.from('feedback').insert({
    message: d.message,
    email,
    user_id: userId,
    role,
    path,
    user_agent: userAgent,
    submission_id: job?.submissionId ?? null,
    invitation_id: job?.invitationId ?? null,
    contact_name: job?.contactName ?? null,
  });
  if (error) {
    console.error('[feedback] insert failed:', error);
    return { error: 'That did not send — try again, or email us directly.' };
  }

  // Stored first, then told: an email that fails must not lose the message.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `Problem report from a ${role}${job?.contactName ? ` (${job.contactName})` : ''}`,
    `${d.message}\n\n` +
      `From:  ${job?.contactName ? `${job.contactName} ` : ''}${email ?? '(no email)'}\n` +
      `Role:  ${role}\n` +
      `Page:  ${path ?? '(unknown)'}\n` +
      (job?.submissionId
        ? `Job:   ${siteUrl}/admin/submissions/${job.submissionId}${job.invitationId ? '#messages' : ''}\n`
        : '') +
      `\nAll reports: ${siteUrl}/admin/feedback`,
  );

  return { ok: true, message: SUCCESS };
}
