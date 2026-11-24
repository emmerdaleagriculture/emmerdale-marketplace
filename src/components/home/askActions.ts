'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/adminNotify';
import type { FormState } from '@/lib/form';

const SUCCESS = 'Thanks. That has come straight to us, and we will be in touch shortly.';

const AskSchema = z
  .object({
    message: z.string().trim().min(3, 'Tell us a little more than that.').max(4000),
    name: z.string().trim().max(120).optional().or(z.literal('')),
    email: z.string().trim().email('That email does not look right.').optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
    postcode: z.string().trim().max(12).optional().or(z.literal('')),
    service: z.string().trim().max(80).optional().or(z.literal('')),
  })
  // A question with nowhere to send the answer is a dead end for both of us.
  .refine((d) => Boolean(d.email) || (d.phone ?? '').replace(/\D/g, '').length >= 7, {
    message: 'Leave an email or a phone number so we can reply.',
  });

/**
 * "Not sure what needs doing? Ask us!" — the question under the home page's
 * Get started button.
 *
 * For the visitor who has a field and a problem but no name for the job: the
 * service list is a wall to them, and before this their only way out was to
 * leave. It is a question to a person, not a job: nothing is parsed, nothing
 * is sent to contractors.
 *
 * It lands in the `feedback` table with role 'question', so it shares the
 * admin list, the Done button and the email with problem reports and needs no
 * schema of its own. The phone number has no column there, so it rides in the
 * message with the postcode and whatever service they had picked.
 */
export async function askUsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Same invisible traps as the problem report: a filled honeypot or a form
  // returned within three seconds is a bot. Answer as if it worked.
  if (String(formData.get('website') || '')) return { ok: true, message: SUCCESS };
  const renderedAt = Number(formData.get('form_ts') || 0);
  if (renderedAt > 0 && Date.now() - renderedAt < 3000) return { ok: true, message: SUCCESS };

  const parsed = AskSchema.safeParse({
    message: formData.get('message'),
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    // Carried over from the widget's own boxes, which have no length limit.
    // Cut rather than refused: an error about a field they cannot see in
    // this form would be one they could not fix.
    postcode: String(formData.get('postcode') ?? '').trim().slice(0, 12),
    service: String(formData.get('service') ?? '').trim().slice(0, 80),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const d = parsed.data;

  const extras = [
    d.phone ? `Phone: ${d.phone}` : null,
    d.postcode ? `Postcode: ${d.postcode.toUpperCase()}` : null,
    d.service ? `Had picked: ${d.service}` : null,
  ].filter(Boolean);
  const stored = extras.length ? `${d.message}\n\n${extras.join('\n')}` : d.message;

  const userAgent = (await headers()).get('user-agent')?.slice(0, 400) ?? null;

  const admin = createServiceRoleClient();
  const { error } = await admin.from('feedback').insert({
    message: stored,
    email: d.email || null,
    role: 'question',
    path: '/',
    user_agent: userAgent,
    contact_name: d.name || null,
  });
  if (error) {
    console.error('[ask-us] insert failed:', error);
    return { error: 'That did not send. Try again in a moment.' };
  }

  // Stored first, then told: an email that fails must not lose the question.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  await notifyAdmins(
    `Question from the home page${d.name ? ` (${d.name})` : ''}`,
    `${d.message}\n\n` +
      `Name:      ${d.name || '(not given)'}\n` +
      `Email:     ${d.email || '(not given)'}\n` +
      `Phone:     ${d.phone || '(not given)'}\n` +
      `Postcode:  ${d.postcode ? d.postcode.toUpperCase() : '(not given)'}\n` +
      (d.service ? `Had picked: ${d.service}\n` : '') +
      `\nAll questions and reports: ${siteUrl}/admin/feedback`,
  );

  return { ok: true, message: SUCCESS };
}
