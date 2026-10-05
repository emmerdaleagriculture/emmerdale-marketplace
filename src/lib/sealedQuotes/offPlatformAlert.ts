import { notifyAdmins } from '@/lib/adminNotify';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import { OFF_PLATFORM } from './clientNote';

export type FlagRule = 'off_platform' | 'phone' | 'email_or_link' | 'postcode';
export type FlagSurface = 'quote note' | 'extra-work proposal' | 'message';

/**
 * A refused note or message, on the record (platform_flags,
 * 20261001160000). Which rule refused it and where — never the words. It is
 * what a contractor's standing is marked down for, so it must be written
 * even when the email below is not. Never throws.
 */
export async function recordRefusal(args: {
  rule: FlagRule;
  surface: FlagSurface;
  sender: 'contractor' | 'customer';
  submissionId: string | null | undefined;
  contractorId?: string | null;
}): Promise<void> {
  const { error } = await createServiceRoleClient().from('platform_flags').insert({
    rule: args.rule,
    surface: args.surface,
    sender: args.sender,
    submission_id: args.submissionId ?? null,
    contractor_id: args.contractorId ?? null,
  });
  if (error) console.error('[sq] platform flag not recorded:', error.message);
}

/** How long a contractor's messages are held for approval after one contact attempt. */
const HOLD_DAYS = 30;

/**
 * A contractor tried to get a contact detail or another channel past the
 * message box before award. Refusing it was not enough on 5 Oct 2026: a
 * phone number was refused at 18:43 and the same number, disguised as two
 * model numbers, went through at 18:44 — and the job was arranged on
 * WhatsApp. From the first attempt their messages before award wait for an
 * admin (sq_post_message holds them while messages_moderated_until is in
 * the future), and admin gets the words. Never throws.
 */
export async function holdAfterContactAttempt(args: {
  rule: FlagRule;
  body: string;
  submissionId: string | null | undefined;
  contractorId: string | null | undefined;
}): Promise<void> {
  if (!args.contractorId) return;
  const admin = createServiceRoleClient();
  const until = new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString();
  const { data: ct, error } = await admin
    .from('contractors')
    .select('business_name, email, messages_moderated_until')
    .eq('id', args.contractorId)
    .maybeSingle();
  if (error) console.error('[sq] contact attempt: contractor lookup failed:', error.message);
  const already = ct?.messages_moderated_until && ct.messages_moderated_until > until;
  if (!already) {
    const { error: upErr } = await admin
      .from('contractors')
      .update({ messages_moderated_until: until })
      .eq('id', args.contractorId);
    if (upErr) console.error('[sq] contact attempt: hold not set:', upErr.message);
  }
  const who = ct?.business_name || ct?.email || 'A contractor';
  await notifyAdmins(
    `Contact-detail attempt: ${who} — messages now held`,
    [
      `${who} tried to send a message before award that was refused (${args.rule.replace(/_/g, ' ')}).`,
      `Their messages before award are now held for your approval for ${HOLD_DAYS} days.`,
      '',
      `"${args.body}"`,
      '',
      args.submissionId ? `Job: ${siteUrl()}/admin/submissions/${args.submissionId}#messages` : '',
    ].join('\n'),
  );
}

/**
 * Tells admin when someone tries to arrange payment outside the platform,
 * and records it.
 *
 * The forms refuse the words (clientNote.ts OFF_PLATFORM), and a refused note
 * or message is never stored, so until 2026-10-01 this email was the only
 * record that it was tried; now platform_flags holds the fact of it too. Whoever tried once may try again by phone once contact details are
 * passed on — which is the conversation admin needs to have.
 *
 * Call it with whatever text was just refused; it does nothing unless the
 * text actually matches, so callers need not know which rule refused it.
 * Never throws: notifyAdmins swallows its own failures, and a lookup that
 * fails just leaves the name out.
 */
export async function flagOffPlatform(args: {
  text: string | string[];
  where: FlagSurface;
  sender: 'contractor' | 'customer';
  submissionId: string | null | undefined;
  contractorId?: string | null;
}): Promise<void> {
  const texts = (Array.isArray(args.text) ? args.text : [args.text]).filter((t) => OFF_PLATFORM.test(t));
  if (texts.length === 0) return;
  await recordRefusal({
    rule: 'off_platform',
    surface: args.where,
    sender: args.sender,
    submissionId: args.submissionId,
    contractorId: args.contractorId,
  });

  let who = args.sender === 'customer' ? 'The customer' : 'A contractor';
  if (args.contractorId) {
    const { data } = await createServiceRoleClient()
      .from('contractors')
      .select('business_name, email')
      .eq('id', args.contractorId)
      .maybeSingle();
    if (data) who = data.business_name || data.email || who;
  }

  await notifyAdmins(
    `Off-platform payment attempt: ${args.sender === 'customer' ? 'customer' : who}`,
    [
      `${who} tried to send a ${args.where} that mentions paying outside the platform. ` +
        'It was refused and has not been stored or shown to anyone; they were asked to reword it.',
      '',
      ...texts.map((t) => `"${t}"`),
      '',
      args.submissionId ? `Job: ${siteUrl()}/admin/submissions/${args.submissionId}` : '',
    ]
      .filter((l, i, all) => l !== '' || all[i - 1] !== '')
      .join('\n'),
  );
}
