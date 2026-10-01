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
