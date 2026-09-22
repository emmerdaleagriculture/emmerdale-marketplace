'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import { redactPath } from '@/lib/analyticsPaths';
import type { FormState } from '@/lib/form';

const SUCCESS = 'Thanks — that has gone straight to us.';

const FeedbackSchema = z.object({
  message: z.string().trim().min(3, 'Tell us a little more than that.').max(4000),
  // Only shown to people we cannot already identify.
  email: z.string().trim().email('That email does not look right.').optional().or(z.literal('')),
  path: z.string().trim().max(512).optional().or(z.literal('')),
});

/**
 * Feedback from anywhere on the site, from anyone.
 *
 * Who they are is resolved HERE, from the session, rather than sent by the
 * page: a hidden role field is a field anyone can edit, and the whole value
 * of knowing whether a complaint came from a contractor or a customer is
 * that it is true.
 *
 * The path is redacted before it is stored — /my/<token> and /quote/<token>
 * are keys, and the reason to capture the page at all is to know which screen
 * annoyed someone, which the redacted form still tells you.
 */
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
  });
  if (error) {
    console.error('[feedback] insert failed:', error);
    return { error: 'That did not send — try again, or email us directly.' };
  }

  // Stored first, then told: an email that fails must not lose the message.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `Feedback from a ${role}`,
    `${d.message}\n\n` +
      `From:  ${email ?? '(not given)'}\n` +
      `Role:  ${role}\n` +
      `Page:  ${path ?? '(unknown)'}\n\n` +
      `All feedback: ${siteUrl}/admin/feedback`,
  );

  return { ok: true, message: SUCCESS };
}
