import { notifyAdmins } from '@/lib/adminNotify';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import { OFF_PLATFORM } from './clientNote';

/**
 * Tells admin when someone tries to arrange payment outside the platform.
 *
 * The forms refuse the words (clientNote.ts OFF_PLATFORM), and a refused note
 * or message is never stored, so this email is the only record that it was
 * tried. Whoever tried once may try again by phone once contact details are
 * passed on — which is the conversation admin needs to have.
 *
 * Call it with whatever text was just refused; it does nothing unless the
 * text actually matches, so callers need not know which rule refused it.
 * Never throws: notifyAdmins swallows its own failures, and a lookup that
 * fails just leaves the name out.
 */
export async function flagOffPlatform(args: {
  text: string | string[];
  where: 'quote note' | 'extra-work proposal' | 'message';
  sender: 'contractor' | 'customer';
  submissionId: string | null | undefined;
  contractorId?: string | null;
}): Promise<void> {
  const texts = (Array.isArray(args.text) ? args.text : [args.text]).filter((t) => OFF_PLATFORM.test(t));
  if (texts.length === 0) return;

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
